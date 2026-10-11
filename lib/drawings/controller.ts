/**
 * 画线交互控制器（M2 Worker C）。
 *
 * 零 React、零运行时 lightweight-charts 依赖：lightweight-charts 只 `import type`，
 * 保证 node 单测可直接加载本文件。
 *
 * 职责：
 * - 创建状态机（8 种工具的点击/拖拽落点，TV 手感：画完工具保持激活）
 * - 选中 / 锚点拖 / 身体拖（拖拽期间冻结图表滚动缩放）
 * - Delete/Escape 快捷键、双击设置、右键菜单、右键空白取消工具
 * - primitive 的 attach/detach/update 同步（订阅 store 变更）
 * - 按品种+周期持久化（storageKey 切换时 reload）
 *
 * 可测性：DOM 监听只做转发，核心逻辑全部是类方法
 * handleMouseDown/handleMouseMove/handleMouseUp/handleKeyDown/handleClick，
 * 参数为纯数据，单测用手写 mock 驱动。
 */
import type {
  IChartApi,
  ISeriesApi,
  MouseEventHandler,
  MouseEventParams,
  Time,
} from 'lightweight-charts';
import { DrawingPrimitive } from './primitives.ts';
import { DrawingStore } from './store.ts';
import {
  createDrawingId,
  TOOL_DEFAULT_STYLE,
  type DrawingModel,
  type DrawingPoint,
  type DrawingStyle,
  type DrawingTool,
  type ToolType,
} from './types.ts';

/** 发给 React 层的 UI 事件（x/y 为相对 chart 容器的 CSS 像素） */
export type DrawUiEvent =
  | { type: 'edit-text'; id: string | null; x: number; y: number }
  | { type: 'open-settings'; id: string; x: number; y: number }
  | { type: 'context-menu'; id: string | null; x: number; y: number };

export interface DrawingsControllerOptions {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  store: DrawingStore;
  precision: number;
  onUi: (ev: DrawUiEvent) => void;
}

/** 各工具创建所需落点数（text 走输入框，不走这里） */
const TOOL_CLICK_COUNT: Record<DrawingTool, number> = {
  trend: 2,
  ray: 2,
  fibo: 2,
  hline: 1,
  rect: 2,
  channel: 3,
  long: 3,
  short: 3,
  text: 1,
};

/** 锚点吸附半径（px） */
const ANCHOR_SNAP_PX = 8;
/** 拖拽启动阈值（px） */
const DRAG_START_PX = 3;
/** rect 按住拖拽的最小位移（px），小于则视为普通点击、走两点兜底 */
const RECT_DRAG_MIN_PX = 4;

interface CreatingState {
  tool: DrawingTool;
  id: string;
  points: DrawingPoint[];
  style: DrawingStyle;
}

interface DragState {
  id: string;
  /** null = 身体拖；数字 = 锚点序号 */
  anchorIndex: number | null;
  startX: number;
  startY: number;
  startTime: number | null;
  startPrice: number | null;
  moved: boolean;
  working: DrawingPoint[] | null;
}

interface RectDragState {
  startTime: number;
  startPrice: number;
  startX: number;
  startY: number;
  moved: boolean;
}

function hoveredIdOf(param: MouseEventParams): string | null {
  const raw = param.hoveredInfo?.objectId ?? param.hoveredObjectId;
  return typeof raw === 'string' ? raw : null;
}

export class DrawingsController {
  private readonly chart: IChartApi;
  private readonly series: ISeriesApi<'Candlestick'>;
  private readonly store: DrawingStore;
  private precision: number;
  private readonly onUi: (ev: DrawUiEvent) => void;

  private tool: ToolType = 'select';
  private storageKey = '';
  private legacyStorageKey?: string;
  private readonly primitives = new Map<string, DrawingPrimitive>();
  private preview: DrawingPrimitive | null = null;
  private creating: CreatingState | null = null;
  private pendingTextPoint: DrawingPoint | null = null;
  private lastHoveredId: string | null = null;
  private drag: DragState | null = null;
  private rectDrag: RectDragState | null = null;
  /** rect 拖拽最后一次 mousemove 落定的两点（mouseup 落定时用） */
  private rectPoints: DrawingPoint[] | null = null;
  private suppressClick = false;
  private attached = false;
  private readonly unsubscribeStore: () => void;

  // 绑定后的 DOM/图表监听器（detach 时移除）
  private readonly onClick: MouseEventHandler<Time> = (param) => this.handleClick(param);
  private readonly onCrosshairMove: MouseEventHandler<Time> = (param) => this.handleCrosshairMove(param);
  private readonly onDomMouseDown = (e: MouseEvent): void => {
    this.handleMouseDown({ clientX: e.clientX, clientY: e.clientY, button: e.button });
  };
  private readonly onDomMouseMove = (e: MouseEvent): void => {
    const p = this.toPanePoint(e.clientX, e.clientY);
    if (p) this.handleMouseMove(p);
  };
  private readonly onDomMouseUp = (): void => {
    this.handleMouseUp();
  };
  private readonly onDomDblClick = (e: MouseEvent): void => {
    const p = this.toPanePoint(e.clientX, e.clientY);
    if (p) this.handleDblClick(p);
  };
  private readonly onDomContextMenu = (e: MouseEvent): void => {
    const p = this.toPanePoint(e.clientX, e.clientY);
    if (!p) return;
    // TV 手感：图表区右键一律吃掉浏览器菜单
    e.preventDefault();
    this.handleContextMenu(p);
  };
  private readonly onDomKeyDown = (e: KeyboardEvent): void => {
    this.handleKeyDown({ key: e.key });
  };

  constructor(opts: DrawingsControllerOptions) {
    this.chart = opts.chart;
    this.series = opts.series;
    this.store = opts.store;
    this.precision = opts.precision;
    this.onUi = opts.onUi;
    // store 任何变更（选中/增删改）→ 同步 primitive；React 层也会订阅做自己的 UI 更新
    this.unsubscribeStore = this.store.subscribe(() => this.syncPrimitives());
  }

  // ---------- 生命周期 ----------

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.chart.subscribeClick(this.onClick);
    this.chart.subscribeCrosshairMove(this.onCrosshairMove);
    const el = this.chart.chartElement();
    el.addEventListener('mousedown', this.onDomMouseDown);
    el.addEventListener('dblclick', this.onDomDblClick);
    el.addEventListener('contextmenu', this.onDomContextMenu);
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.onDomKeyDown);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', this.onDomMouseMove);
      window.addEventListener('mouseup', this.onDomMouseUp);
    }
    this.updateCursor();
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.chart.unsubscribeClick(this.onClick);
    this.chart.unsubscribeCrosshairMove(this.onCrosshairMove);
    const el = this.chart.chartElement();
    el.removeEventListener('mousedown', this.onDomMouseDown);
    el.removeEventListener('dblclick', this.onDomDblClick);
    el.removeEventListener('contextmenu', this.onDomContextMenu);
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.onDomKeyDown);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', this.onDomMouseMove);
      window.removeEventListener('mouseup', this.onDomMouseUp);
    }
  }

  /** 彻底销毁：解绑一切 + 卸掉全部 primitive */
  destroy(): void {
    this.detach();
    this.unsubscribeStore();
    this.cancelCreating();
    this.drag = null;
    this.rectDrag = null;
    for (const prim of this.primitives.values()) {
      this.series.detachPrimitive(prim);
    }
    this.primitives.clear();
  }

  // ---------- 工具 / 精度 / 存储键 ----------

  getTool(): ToolType {
    return this.tool;
  }

  setTool(tool: ToolType): void {
    this.tool = tool;
    this.cancelCreating();
    this.updateCursor();
  }

  setPrecision(p: number): void {
    this.precision = p;
    const selectedId = this.store.getSelectedId();
    for (const [id, prim] of this.primitives) {
      const m = this.store.get(id);
      if (m) prim.update(m, id === selectedId);
    }
  }

  setStorageKey(key: string, legacyKey?: string): void {
    this.storageKey = key;
    this.legacyStorageKey = legacyKey;
  }

  /** 换品种/周期：清空并从 localStorage 重建全部 primitive */
  reload(): void {
    this.cancelCreating();
    this.drag = null;
    this.rectDrag = null;
    for (const prim of this.primitives.values()) {
      this.series.detachPrimitive(prim);
    }
    this.primitives.clear();
    this.store.clear();
    for (const m of DrawingStore.load(this.storageKey, this.legacyStorageKey)) {
      this.store.add(m);
    }
    this.syncPrimitives();
  }

  /** store → primitive 全量 diff 同步（增删改 + 选中态） */
  syncPrimitives(): void {
    const selectedId = this.store.getSelectedId();
    const seen = new Set<string>();
    for (const m of this.store.list()) {
      seen.add(m.id);
      const sel = m.id === selectedId;
      const existing = this.primitives.get(m.id);
      if (existing) {
        existing.update(m, sel);
      } else {
        const prim = new DrawingPrimitive(m, {
          selected: sel,
          precision: this.precision,
        });
        this.series.attachPrimitive(prim);
        this.primitives.set(m.id, prim);
      }
    }
    for (const [id, prim] of this.primitives) {
      if (!seen.has(id)) {
        this.series.detachPrimitive(prim);
        this.primitives.delete(id);
      }
    }
  }

  // ---------- 创建状态机 ----------

  /** 图表 click 事件入口（可单测） */
  handleClick(param: MouseEventParams): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    if (!param.point) return;
    const hovered = hoveredIdOf(param);
    if (hovered !== null && this.store.get(hovered) !== undefined) {
      // 点中画线：选中，工具保持激活（TV 手感）
      this.store.select(hovered);
      return;
    }
    if (this.tool === 'select') {
      this.store.select(null);
      return;
    }
    const time = param.time === undefined || param.time === null
      ? null
      : (param.time as unknown as number);
    const price = this.series.coordinateToPrice(param.point.y);
    if (time === null || price === null) return;
    this.placePoint({ time: Math.round(time), price }, param.point.x, param.point.y);
  }

  /** crosshair 移动：更新悬停 id + 创建预览 */
  handleCrosshairMove(param: MouseEventParams): void {
    this.lastHoveredId = hoveredIdOf(param);
    if (!this.creating || this.creating.tool === 'text' || !param.point) return;
    const time = param.time === undefined || param.time === null
      ? null
      : (param.time as unknown as number);
    const price = this.series.coordinateToPrice(param.point.y);
    if (time === null || price === null) return;
    const c = this.creating;
    this.attachPreview({
      id: c.id,
      tool: c.tool,
      points: [...c.points, { time: Math.round(time), price }],
      style: c.style,
      createdAt: Date.now(),
    });
  }

  private placePoint(p: DrawingPoint, px: number, py: number): void {
    const tool = this.tool as DrawingTool; // 调用方已保证 tool !== 'select'
    if (tool === 'text') {
      this.pendingTextPoint = p;
      this.onUi({ type: 'edit-text', id: null, x: px, y: py });
      return;
    }
    const need = TOOL_CLICK_COUNT[tool];
    if (!this.creating || this.creating.tool !== tool) {
      this.creating = {
        tool,
        id: createDrawingId(),
        points: [p],
        style: { ...TOOL_DEFAULT_STYLE[tool] },
      };
    } else {
      this.creating.points.push(p);
    }
    if (this.creating.points.length >= need) {
      this.finalizeCreating();
    } else {
      const c = this.creating;
      this.attachPreview({
        id: c.id,
        tool: c.tool,
        points: [...c.points],
        style: c.style,
        createdAt: Date.now(),
      });
    }
  }

  private finalizeCreating(): void {
    const c = this.creating;
    if (!c) return;
    const model: DrawingModel = {
      id: c.id,
      tool: c.tool,
      points: [...c.points],
      style: { ...c.style },
      createdAt: Date.now(),
    };
    this.creating = null;
    this.detachPreview();
    this.store.add(model);
    this.store.save(this.storageKey);
    // TV 手感：工具保持激活，可继续画下一个
  }

  private cancelCreating(): void {
    this.creating = null;
    this.pendingTextPoint = null;
    this.rectPoints = null;
    this.detachPreview();
  }

  private attachPreview(model: DrawingModel): void {
    if (!this.preview) {
      this.preview = new DrawingPrimitive(model, {
        selected: false,
        precision: this.precision,
        preview: true,
      });
      this.series.attachPrimitive(this.preview);
    } else {
      this.preview.update(model, false);
    }
  }

  private detachPreview(): void {
    if (this.preview) {
      this.series.detachPrimitive(this.preview);
      this.preview = null;
    }
  }

  // ---------- 选中 / 拖拽 ----------

  /** DOM mousedown 转发入口（可单测；坐标为 client 像素） */
  handleMouseDown(e: { clientX: number; clientY: number; button: number }): void {
    if (e.button !== 0) return;
    const p = this.toPanePoint(e.clientX, e.clientY);
    if (!p) return;
    const hoveredModel = this.lastHoveredId !== null ? this.store.get(this.lastHoveredId) : undefined;
    if (hoveredModel) {
      // 可能是拖拽：先记录，移动超阈值才算拖
      this.drag = {
        id: hoveredModel.id,
        anchorIndex: this.anchorAt(hoveredModel, p.x, p.y),
        startX: p.x,
        startY: p.y,
        startTime: this.timeAt(p.x),
        startPrice: this.priceAt(p.y),
        moved: false,
        working: null,
      };
      this.freezeChart(true);
      return;
    }
    // rect 工具：按住直接拉出（拖拽优先于两点点击兜底）
    if (this.tool === 'rect') {
      const time = this.timeAt(p.x);
      const price = this.priceAt(p.y);
      if (time === null || price === null) return;
      this.creating = null; // 拖拽 supersede 之前可能存在的单点 creating
      this.rectDrag = {
        startTime: Math.round(time),
        startPrice: price,
        startX: p.x,
        startY: p.y,
        moved: false,
      };
      this.attachPreview({
        id: `preview-rect`,
        tool: 'rect',
        points: [{ time: Math.round(time), price }],
        style: { ...TOOL_DEFAULT_STYLE.rect },
        createdAt: Date.now(),
      });
      this.freezeChart(true);
    }
  }

  /** DOM mousemove 转发入口（可单测；p 为 chart 容器相对 CSS 像素） */
  handleMouseMove(p: { x: number; y: number }): void {
    if (this.rectDrag) {
      const r = this.rectDrag;
      if (Math.hypot(p.x - r.startX, p.y - r.startY) >= RECT_DRAG_MIN_PX) {
        r.moved = true;
      }
      if (r.moved) {
        const time = this.timeAt(p.x);
        const price = this.priceAt(p.y);
        if (time === null || price === null) return;
        this.rectPoints = [
          { time: r.startTime, price: r.startPrice },
          { time: Math.round(time), price },
        ];
        this.attachPreview({
          id: `preview-rect`,
          tool: 'rect',
          points: [...this.rectPoints],
          style: { ...TOOL_DEFAULT_STYLE.rect },
          createdAt: Date.now(),
        });
      }
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) < DRAG_START_PX) return;
    d.moved = true;
    const time = this.timeAt(p.x);
    const price = this.priceAt(p.y);
    if (time === null || price === null) return;
    const model = this.store.get(d.id);
    if (!model) return;
    const base = d.working ?? model.points;
    let next: DrawingPoint[];
    if (d.anchorIndex !== null) {
      // 锚点拖：只动该点
      next = base.map((pt, i) =>
        i === d.anchorIndex ? { time: Math.round(time), price } : pt,
      );
    } else if (d.startTime !== null && d.startPrice !== null) {
      // 身体拖：全体点平移
      const dt = time - d.startTime;
      const dp = price - d.startPrice;
      next = base.map((pt) => ({ time: Math.round(pt.time + dt), price: pt.price + dp }));
    } else {
      return;
    }
    d.working = next;
    const prim = this.primitives.get(d.id);
    prim?.update({ ...model, points: next }, true);
  }

  /** DOM mouseup 转发入口（可单测） */
  handleMouseUp(): void {
    if (this.rectDrag) {
      const r = this.rectDrag;
      this.rectDrag = null;
      this.freezeChart(false);
      const points = this.rectPoints;
      this.rectPoints = null;
      if (r.moved) {
        this.detachPreview();
        this.creating = null;
        if (points && points.length === 2) {
          this.store.add({
            id: createDrawingId(),
            tool: 'rect',
            points,
            style: { ...TOOL_DEFAULT_STYLE.rect },
            createdAt: Date.now(),
          });
          this.store.save(this.storageKey);
        }
        // 拖拽后的 click 事件是本次 mouseup 的余波，吃掉
        this.suppressClick = true;
      } else {
        this.detachPreview();
        // 没拖动：留给随后的 click 事件走两点点击兜底
      }
      return;
    }
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.freezeChart(false);
    if (d.moved && d.working) {
      this.store.update(d.id, { points: d.working });
      this.store.save(this.storageKey);
      // 拖拽后的 click 事件吃掉，避免误触发创建/选中
      this.suppressClick = true;
    }
  }

  // ---------- 键盘 / 双击 / 右键 ----------

  /** DOM keydown 转发入口（可单测） */
  handleKeyDown(e: { key: string }): void {
    if (typeof document !== 'undefined') {
      const ae = document.activeElement as HTMLElement | null;
      if (ae) {
        const tag = ae.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable) return;
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelected();
    } else if (e.key === 'Escape') {
      if (this.creating || this.pendingTextPoint) {
        this.cancelCreating();
      } else if (this.tool !== 'select') {
        this.setTool('select');
      }
    }
  }

  /** DOM dblclick 转发入口（可单测） */
  handleDblClick(p: { x: number; y: number }): void {
    const id = this.lastHoveredId;
    if (id !== null && this.store.get(id) !== undefined) {
      this.onUi({ type: 'open-settings', id, x: p.x, y: p.y });
    }
  }

  /** DOM contextmenu 转发入口（可单测；调用方已 preventDefault） */
  handleContextMenu(p: { x: number; y: number }): void {
    const id = this.lastHoveredId;
    if (id !== null && this.store.get(id) !== undefined) {
      this.onUi({ type: 'context-menu', id, x: p.x, y: p.y });
    } else {
      // 右键空白：取消当前工具（TV 手感）
      this.cancelCreating();
      if (this.tool !== 'select') this.setTool('select');
      else this.store.select(null);
    }
  }

  // ---------- 编辑操作 ----------

  /** 设置弹窗改样式 */
  updateStyle(id: string, patch: Partial<DrawingStyle>): void {
    const m = this.store.get(id);
    if (!m) return;
    this.store.update(id, { style: { ...m.style, ...patch } });
    this.store.save(this.storageKey);
  }

  /**
   * 文字提交。
   * id=null → 用 text 工具点击时记录的落点新建；id 非 null → 更新该画线文字。
   * 空文本忽略。
   */
  commitText(id: string | null, text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    if (id === null) {
      const pt = this.pendingTextPoint;
      this.pendingTextPoint = null;
      if (!pt) return;
      const model: DrawingModel = {
        id: createDrawingId(),
        tool: 'text',
        points: [pt],
        style: { ...TOOL_DEFAULT_STYLE.text, text: trimmed },
        createdAt: Date.now(),
      };
      this.store.add(model);
      this.store.save(this.storageKey);
      // text 工具也保持激活（TV 手感）
    } else {
      const m = this.store.get(id);
      if (!m) return;
      this.store.update(id, { style: { ...m.style, text: trimmed } });
      this.store.save(this.storageKey);
    }
  }

  deleteSelected(): void {
    const id = this.store.getSelectedId();
    if (id !== null) {
      this.store.remove(id);
      this.store.save(this.storageKey);
    }
  }

  // ---------- 内部小工具 ----------

  private toPanePoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = this.chart.chartElement();
    if (typeof el.getBoundingClientRect !== 'function') return null;
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private timeAt(x: number): number | null {
    const t = this.chart.timeScale().coordinateToTime(x);
    return t === null || t === undefined ? null : (t as unknown as number);
  }

  private priceAt(y: number): number | null {
    const p = this.series.coordinateToPrice(y);
    return p === null ? null : (p as number);
  }

  private anchorAt(model: DrawingModel, x: number, y: number): number | null {
    for (let i = 0; i < model.points.length; i++) {
      const pt = model.points[i];
      const px = this.chart.timeScale().timeToCoordinate(pt.time as unknown as Time);
      const py = this.series.priceToCoordinate(pt.price);
      if (px === null || py === null) continue;
      if (Math.hypot(px - x, py - y) <= ANCHOR_SNAP_PX) return i;
    }
    return null;
  }

  private freezeChart(freeze: boolean): void {
    this.chart.applyOptions({ handleScroll: !freeze, handleScale: !freeze });
  }

  private updateCursor(): void {
    const el = this.chart.chartElement();
    if (el && el.style) {
      // TV 手感：画线工具激活时十字光标
      el.style.cursor = this.tool === 'select' ? '' : 'crosshair';
    }
  }
}
