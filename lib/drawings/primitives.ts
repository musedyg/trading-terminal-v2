/**
 * 画线工具的 Series Primitive 画布渲染器（lightweight-charts v5）。
 *
 * 纯渲染层：零 DOM、零 React，只依赖 lightweight-charts 类型 + ./types.ts + ./geometry.ts。
 * 所有坐标换算只走 x()/y()（跟随图表缩放 / 平移），从不自己算像素偏移。
 * autoscaleInfo() 恒返回 null：画线不参与自动缩放。
 *
 * 2026-10 浮层优化（官方 @tradingview/lwc-toolkit）：
 * - 基类换 toolkit PluginBase：挂载/卸载、chart/series 引用与 requestUpdate 管道走官方实现；
 *   本类只保留可空镜像引用做防御（渲染/命中在未挂载时安全早退）。
 * - 轴向直线与矩形边用 toolkit positionsLine/positionsBox 做位图像素对齐（见 lib/chart/pixel-snap），
 *   高分屏上不再发虚；圆角 pill 改用 toolkit drawRoundRect。
 * - update() 的重绘请求经帧合并（lib/scheduling/coalesced-task），拖拽时每帧最多刷新一次。
 * - draw() 前做可见范围裁剪：锚点时间全部落在可视区间之外的画线整幅跳过（hline 除外）。
 *   命中判定仍走 geometry.ts 的距离算法（toolkit 的 canvas/markers 未随 1.0.0 发布）。
 */
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  IChartApiBase,
  IPrimitivePaneView,
  ISeriesApi,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import { PluginBase } from '@tradingview/lwc-toolkit/plugin-base';
import { drawRoundRect } from '@tradingview/lwc-toolkit/canvas/round-rect';
import { snapLineCenter, snapSpan } from '../chart/pixel-snap.ts';
import { createCoalescedTask } from '../scheduling/coalesced-task.ts';
import { FIBO_RATIOS } from './types.ts';
import type { DrawingModel } from './types.ts';
import {
  fiboLevelPrices,
  hitBox,
  hitChannel,
  hitFibo,
  hitHLine,
  hitLine,
  hitPosition,
  hitRay,
  hitRect,
  positionStats,
} from './geometry.ts';

/** 命中判定容差（像素） */
const HIT_TOLERANCE = 6;
/** 选中手柄半径（像素） */
const HANDLE_RADIUS = 4;
/** 虚线样式 */
const DASH_PATTERN: readonly number[] = [6, 4];
/** TV 风格斐波那契配色（对应 FIBO_RATIOS 的 7 档） */
const FIBO_COLORS: readonly string[] = [
  '#787b86',
  '#f23645',
  '#ff9800',
  '#4caf50',
  '#2962ff',
  '#9c27b0',
  '#787b86',
];
/** 多空持仓线配色 */
const ENTRY_LINE_COLOR = '#ffffff';
const SL_COLOR = '#f23645';
const TP_COLOR = '#4caf50';
const PROFIT_FILL_COLOR = '#2962ff';
/** 背景趋势虚线（fibo） */
const FIBO_TREND_COLOR = '#787b86';

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

type Ctx = CanvasRenderingContext2D;

interface Px {
  x: number;
  y: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** '#rrggbb' + alpha → 'rgba(...)'；非 hex 原样返回 */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function strokeLine(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  dashed: boolean,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashed ? [...DASH_PATTERN] : []);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** 选中手柄：半径 4 的圆，白底 + 图形色边 */
function drawHandle(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 点 p 向直线 ab 的投影（无限直线，不钳制） */
function projectOntoLine(px: number, py: number, ax: number, ay: number, bx: number, by: number): Px {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  return { x: ax + t * dx, y: ay + t * dy };
}

/** 纯估算文本宽度（hitTest 无 canvas 上下文时用；CJK 按整字、拉丁按 0.55 字宽） */
function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    w += code > 0xff ? fontSize : fontSize * 0.55;
  }
  return w;
}

/** 圆角 pill 底（toolkit drawRoundRect 构建路径后填充） */
function drawPill(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string): void {
  const r = Math.min(h / 2, 8);
  drawRoundRect(ctx, x, y, w, h, [r, r, r, r]);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** 百分比标签去尾零：0.236 → '23.6%'，0.5 → '50%' */
function pctLabel(ratio: number): string {
  return `${parseFloat((ratio * 100).toFixed(1))}%`;
}

export interface DrawingPrimitiveOptions {
  selected: boolean;
  precision: number;
  preview?: boolean;
}

export class DrawingPrimitive extends PluginBase {
  private model: DrawingModel;
  private selected: boolean;
  private precision: number;
  private preview: boolean;
  /** PluginBase 的 chart/series getter 在未挂载时抛错，渲染/命中用可空镜像做防御 */
  private chartRef?: IChartApiBase<Time>;
  private seriesRef?: ISeriesApi<SeriesType, Time>;
  /** 当前帧的像素比（renderAll 写入，像素对齐用） */
  private hpr = 1;
  private vpr = 1;
  private readonly paneView: IPrimitivePaneView;
  private readonly paneViewList: IPrimitivePaneView[];
  /** update() 的重绘请求帧合并：拖拽高频更新时每帧最多真正 requestUpdate 一次 */
  private readonly updateCoalescer = createCoalescedTask(() => this.requestUpdate());

  constructor(model: DrawingModel, opts: DrawingPrimitiveOptions) {
    super();
    this.model = model;
    this.selected = opts.selected;
    this.precision = opts.precision;
    this.preview = opts.preview ?? false;
    this.paneView = {
      renderer: () => ({
        draw: (target: CanvasRenderingTarget2D) => this.renderAll(target),
      }),
    };
    this.paneViewList = [this.paneView];
  }

  update(model: DrawingModel, selected: boolean): void {
    this.model = model;
    this.selected = selected;
    this.updateCoalescer.schedule();
  }

  override attached(param: SeriesAttachedParameter<Time>): void {
    super.attached(param);
    this.chartRef = param.chart;
    this.seriesRef = param.series as ISeriesApi<SeriesType, Time>;
  }

  override detached(): void {
    this.updateCoalescer.cancel();
    super.detached();
    this.chartRef = undefined;
    this.seriesRef = undefined;
  }

  paneViews(): IPrimitivePaneView[] {
    return this.paneViewList;
  }

  autoscaleInfo(): null {
    return null;
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const hit = this.hitTestTool(x, y);
    if (!hit) return null;
    return {
      externalId: this.model.id,
      zOrder: 'normal' as const,
      cursorStyle: 'pointer',
      distance: 0,
    };
  }

  // ---------- 坐标换算 ----------

  private x(time: number): number | null {
    if (!this.chartRef) return null;
    return this.chartRef.timeScale().timeToCoordinate(time as Time);
  }

  private y(price: number): number | null {
    if (!this.seriesRef) return null;
    return this.seriesRef.priceToCoordinate(price);
  }

  private paneWidth(): number {
    return this.chartRef ? this.chartRef.chartElement().clientWidth : 0;
  }

  private paneHeight(): number {
    return this.chartRef ? this.chartRef.chartElement().clientHeight : 0;
  }

  /** model.points[i] → 像素，任一坐标为 null 则返回 null */
  private px(i: number): Px | null {
    const p = this.model.points[i];
    if (!p) return null;
    const x = this.x(p.time);
    const y = this.y(p.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  private showHandles(): boolean {
    return this.selected && !this.preview;
  }

  /**
   * 可见范围裁剪：所有锚点时间都落在可视区间之外时整幅跳过。
   * hline 只由价格决定、与时间无关，恒不裁剪；拿不到可见范围时不裁剪（保守绘制）。
   */
  private isOutsideVisibleRange(): boolean {
    if (this.model.tool === 'hline') return false;
    const ts = this.chartRef?.timeScale();
    if (!ts || typeof ts.getVisibleRange !== 'function') return false;
    const range = ts.getVisibleRange();
    if (!range) return false;
    const from = Number(range.from);
    const to = Number(range.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
    let min = Infinity;
    let max = -Infinity;
    for (const p of this.model.points) {
      if (p.time < min) min = p.time;
      if (p.time > max) max = p.time;
    }
    return max < from || min > to;
  }

  /** 水平线 y 像素对齐（toolkit positionsLine） */
  private snapY(y: number, lineWidth: number): number {
    return snapLineCenter(y, this.vpr, lineWidth);
  }

  // ---------- 渲染入口 ----------

  private renderAll(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      this.hpr = horizontalPixelRatio;
      this.vpr = verticalPixelRatio;
      context.save();
      context.scale(horizontalPixelRatio, verticalPixelRatio);
      this.draw(context);
      context.restore();
    });
  }

  private draw(ctx: Ctx): void {
    if (this.isOutsideVisibleRange()) return;
    switch (this.model.tool) {
      case 'trend':
        this.drawTrend(ctx);
        break;
      case 'ray':
        this.drawRay(ctx);
        break;
      case 'hline':
        this.drawHLine(ctx);
        break;
      case 'rect':
        this.drawRect(ctx);
        break;
      case 'fibo':
        this.drawFibo(ctx);
        break;
      case 'channel':
        this.drawChannel(ctx);
        break;
      case 'long':
      case 'short':
        this.drawPosition(ctx);
        break;
      case 'text':
        this.drawText(ctx);
        break;
    }
  }

  private drawTrend(ctx: Ctx): void {
    const a = this.px(0);
    const b = this.px(1);
    if (!a || !b) return;
    const s = this.model.style;
    strokeLine(ctx, a.x, a.y, b.x, b.y, s.color, s.lineWidth, s.dashed ?? false);
    if (this.showHandles()) {
      drawHandle(ctx, a.x, a.y, s.color);
      drawHandle(ctx, b.x, b.y, s.color);
    }
  }

  private drawRay(ctx: Ctx): void {
    const a = this.px(0);
    const b = this.px(1);
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const scale = (this.paneWidth() * 2) / len;
    const s = this.model.style;
    strokeLine(ctx, a.x, a.y, a.x + dx * scale, a.y + dy * scale, s.color, s.lineWidth, s.dashed ?? false);
    if (this.showHandles()) {
      drawHandle(ctx, a.x, a.y, s.color);
      drawHandle(ctx, b.x, b.y, s.color);
    }
  }

  private drawHLine(ctx: Ctx): void {
    const p = this.model.points[0];
    if (!p) return;
    const rawY = this.y(p.price);
    if (rawY === null) return;
    const s = this.model.style;
    const lineY = this.snapY(rawY, s.lineWidth);
    const w = this.paneWidth();
    strokeLine(ctx, 0, lineY, w, lineY, s.color, s.lineWidth, s.dashed ?? false);
  }

  private drawRect(ctx: Ctx): void {
    const a = this.px(0);
    const b = this.px(1);
    if (!a || !b) return;
    const s = this.model.style;
    // 矩形四边像素对齐（toolkit positionsBox）：填充与描边共用同一组对齐坐标
    const xs = snapSpan(a.x, b.x, this.hpr);
    const ys = snapSpan(a.y, b.y, this.vpr);
    ctx.fillStyle = hexToRgba(s.color, s.fillOpacity ?? 0.12);
    ctx.fillRect(xs.start, ys.start, xs.length, ys.length);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.lineWidth;
    ctx.setLineDash(s.dashed ? [...DASH_PATTERN] : []);
    ctx.strokeRect(xs.start, ys.start, xs.length, ys.length);
    ctx.setLineDash([]);
    if (this.showHandles()) {
      drawHandle(ctx, a.x, a.y, s.color);
      drawHandle(ctx, b.x, a.y, s.color);
      drawHandle(ctx, a.x, b.y, s.color);
      drawHandle(ctx, b.x, b.y, s.color);
    }
  }

  private drawFibo(ctx: Ctx): void {
    const p1 = this.model.points[0];
    const p2 = this.model.points[1];
    const a = this.px(0);
    const b = this.px(1);
    if (!p1 || !p2 || !a || !b) return;
    const s = this.model.style;
    const x0 = this.x(Math.min(p1.time, p2.time));
    const x1 = this.x(Math.max(p1.time, p2.time));
    if (x0 === null || x1 === null) return;

    // 背后灰色虚线：p1 → p2
    strokeLine(ctx, a.x, a.y, b.x, b.y, FIBO_TREND_COLOR, 1, true);

    const levels = fiboLevelPrices(p1, p2, FIBO_RATIOS);
    const labelX = x1 + 76;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const rawLy = this.y(level.price);
      if (rawLy === null) return;
      const ly = this.snapY(rawLy, s.lineWidth);
      const color = FIBO_COLORS[i] ?? s.color;
      strokeLine(ctx, x0, ly, x1 + 70, ly, color, s.lineWidth, false);
      ctx.font = `11px ${FONT_STACK}`;
      ctx.fillStyle = color;
      ctx.fillText(`${pctLabel(level.ratio)}  ${level.price.toFixed(this.precision)}`, labelX, ly);
    }

    if (this.showHandles()) {
      drawHandle(ctx, a.x, a.y, s.color);
      drawHandle(ctx, b.x, b.y, s.color);
    }
  }

  private drawChannel(ctx: Ctx): void {
    const a = this.px(0);
    const b = this.px(1);
    const c = this.px(2);
    if (!a || !b || !c) return;
    const s = this.model.style;
    // 像素空间偏移向量：off = pix(p3) − 投影点
    const proj = projectOntoLine(c.x, c.y, a.x, a.y, b.x, b.y);
    const off = { x: c.x - proj.x, y: c.y - proj.y };
    const q1 = { x: a.x + off.x, y: a.y + off.y };
    const q2 = { x: b.x + off.x, y: b.y + off.y };
    // 两线之间半透明填充
    ctx.fillStyle = hexToRgba(s.color, s.fillOpacity ?? 0.08);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(q2.x, q2.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.closePath();
    ctx.fill();
    const dashed = s.dashed ?? false;
    strokeLine(ctx, a.x, a.y, b.x, b.y, s.color, s.lineWidth, dashed);
    strokeLine(ctx, q1.x, q1.y, q2.x, q2.y, s.color, s.lineWidth, dashed);
    if (this.showHandles()) {
      drawHandle(ctx, a.x, a.y, s.color);
      drawHandle(ctx, b.x, b.y, s.color);
      drawHandle(ctx, c.x, c.y, s.color);
    }
  }

  private drawPosition(ctx: Ctx): void {
    const pts = this.model.points;
    if (pts.length < 3) return;
    const entry = pts[0];
    const sl = pts[1];
    const tp = pts[2];
    const x0 = this.x(Math.min(entry.time, sl.time, tp.time));
    const x1 = this.x(Math.max(entry.time, sl.time, tp.time));
    const rawEntryY = this.y(entry.price);
    const rawSlY = this.y(sl.price);
    const rawTpY = this.y(tp.price);
    if (x0 === null || x1 === null || rawEntryY === null || rawSlY === null || rawTpY === null) return;
    const s = this.model.style;
    const w = this.paneWidth();
    // 三条全宽线像素对齐；盈亏填充共用对齐后的 y，保证填充边缘与线重合
    const entryY = this.snapY(rawEntryY, s.lineWidth);
    const slY = this.snapY(rawSlY, s.lineWidth);
    const tpY = this.snapY(rawTpY, s.lineWidth);
    const xs = snapSpan(x0, x1, this.hpr);

    // 盈亏区间填充（x0 → x1）
    ctx.fillStyle = hexToRgba(PROFIT_FILL_COLOR, 0.12);
    ctx.fillRect(xs.start, Math.min(entryY, tpY), xs.length, Math.abs(tpY - entryY));
    ctx.fillStyle = hexToRgba(SL_COLOR, 0.12);
    ctx.fillRect(xs.start, Math.min(entryY, slY), xs.length, Math.abs(slY - entryY));

    // 三条全宽线：入场白虚线 / 止损红 / 目标绿
    strokeLine(ctx, 0, entryY, w, entryY, ENTRY_LINE_COLOR, s.lineWidth, true);
    strokeLine(ctx, 0, slY, w, slY, SL_COLOR, s.lineWidth, false);
    strokeLine(ctx, 0, tpY, w, tpY, TP_COLOR, s.lineWidth, false);

    // 中间统计标签
    const stats = positionStats(entry.price, sl.price, tp.price);
    const line1 = `${stats.dir === 'long' ? '多头' : '空头'} · 盈亏比 ${stats.rr.toFixed(2)}`;
    const line2 = `+${stats.rewardPct.toFixed(2)}% / -${stats.riskPct.toFixed(2)}%`;
    const fontSize = 12;
    const pad = 8;
    const lineH = 16;
    const labelW = Math.max(estimateTextWidth(line1, fontSize), estimateTextWidth(line2, fontSize)) + pad * 2;
    const labelH = lineH * 2 + pad * 2;
    let cx = (x0 + x1) / 2;
    let cy = (entryY + tpY) / 2;
    cx = Math.min(Math.max(cx, labelW / 2 + 2), Math.max(labelW / 2 + 2, w - labelW / 2 - 2));
    const ph = this.paneHeight();
    cy = Math.min(Math.max(cy, labelH / 2 + 2), Math.max(labelH / 2 + 2, ph - labelH / 2 - 2));
    drawPill(ctx, cx - labelW / 2, cy - labelH / 2, labelW, labelH, 'rgba(0,0,0,0.55)');
    ctx.font = `${fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText(line1, cx, cy - labelH / 2 + pad);
    ctx.fillText(line2, cx, cy - labelH / 2 + pad + lineH);

    if (this.showHandles()) {
      const ex = this.x(entry.time);
      const sx = this.x(sl.time);
      const tx = this.x(tp.time);
      if (ex !== null) drawHandle(ctx, ex, entryY, s.color);
      if (sx !== null) drawHandle(ctx, sx, slY, SL_COLOR);
      if (tx !== null) drawHandle(ctx, tx, tpY, TP_COLOR);
    }
  }

  /** 文本框（绘制与 hitTest 共用同一份几何） */
  private textBox(): Box | null {
    const p = this.px(0);
    if (!p) return null;
    const text = this.model.style.text ?? '';
    if (text.length === 0) return null;
    const fontSize = this.model.style.fontSize ?? 13;
    const pad = 6;
    return {
      x: p.x,
      y: p.y,
      w: estimateTextWidth(text, fontSize) + pad * 2,
      h: fontSize + pad * 2,
    };
  }

  private drawText(ctx: Ctx): void {
    const box = this.textBox();
    if (!box) return;
    const s = this.model.style;
    const text = s.text ?? '';
    const fontSize = s.fontSize ?? 13;
    const pad = 6;
    drawPill(ctx, box.x, box.y, box.w, box.h, 'rgba(30,34,45,.92)');
    ctx.font = `${fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = s.color;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(text, box.x + pad, box.y + pad);
    if (this.showHandles()) {
      drawHandle(ctx, box.x, box.y, s.color);
    }
  }

  // ---------- 命中判定 ----------

  private hitTestTool(x: number, y: number): boolean {
    const tool = this.model.tool;
    switch (tool) {
      case 'trend': {
        const a = this.px(0);
        const b = this.px(1);
        if (!a || !b) return false;
        return hitLine(x, y, a.x, a.y, b.x, b.y, HIT_TOLERANCE);
      }
      case 'ray': {
        const a = this.px(0);
        const b = this.px(1);
        if (!a || !b) return false;
        return hitRay(x, y, a.x, a.y, b.x, b.y, HIT_TOLERANCE);
      }
      case 'hline': {
        const p = this.model.points[0];
        if (!p) return false;
        const lineY = this.y(p.price);
        if (lineY === null) return false;
        return hitHLine(y, lineY, x, 0, this.paneWidth(), HIT_TOLERANCE);
      }
      case 'rect': {
        const a = this.px(0);
        const b = this.px(1);
        if (!a || !b) return false;
        return hitRect(x, y, a.x, a.y, b.x, b.y, HIT_TOLERANCE);
      }
      case 'fibo': {
        const p1 = this.model.points[0];
        const p2 = this.model.points[1];
        if (!p1 || !p2) return false;
        const x0 = this.x(Math.min(p1.time, p2.time));
        const x1 = this.x(Math.max(p1.time, p2.time));
        if (x0 === null || x1 === null) return false;
        const levelYs: number[] = [];
        for (const level of fiboLevelPrices(p1, p2, FIBO_RATIOS)) {
          const ly = this.y(level.price);
          if (ly === null) return false;
          levelYs.push(ly);
        }
        return hitFibo(x, y, x0, x1 + 70, levelYs, HIT_TOLERANCE);
      }
      case 'channel': {
        const a = this.px(0);
        const b = this.px(1);
        const c = this.px(2);
        if (!a || !b || !c) return false;
        return hitChannel(x, y, a.x, a.y, b.x, b.y, c.x, c.y, HIT_TOLERANCE);
      }
      case 'long':
      case 'short': {
        const pts = this.model.points;
        if (pts.length < 3) return false;
        const entry = pts[0];
        const sl = pts[1];
        const tp = pts[2];
        const x0 = this.x(Math.min(entry.time, sl.time, tp.time));
        const x1 = this.x(Math.max(entry.time, sl.time, tp.time));
        const entryY = this.y(entry.price);
        const slY = this.y(sl.price);
        const tpY = this.y(tp.price);
        if (x0 === null || x1 === null || entryY === null || slY === null || tpY === null) return false;
        return hitPosition(x, y, x0, x1, entryY, slY, tpY, HIT_TOLERANCE);
      }
      case 'text': {
        const box = this.textBox();
        if (!box) return false;
        return hitBox(x, y, box, HIT_TOLERANCE);
      }
    }
  }
}
