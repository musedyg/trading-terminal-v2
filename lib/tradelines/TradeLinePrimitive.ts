/**
 * TP/SL/挂单线的 Series Primitive 画布渲染器（lightweight-charts v5）。
 *
 * 纯渲染层：零 DOM、零 React，只依赖 lightweight-charts 类型 + ./types.ts。
 * - 全宽水平线 + 价格轴标签（TP 绿 / SL 红 / 挂单 蓝虚线）
 * - 所有坐标只走 priceToCoordinate，跟随缩放 / 平移
 * - autoscaleInfo() 恒返回 null：不参与自动缩放
 * - hitTest() 恒返回 null：不参与图表命中判定（避免干扰 M2 画线控制器），
 *   拖拽命中由 TradeLinesLayer 用 priceToCoordinate 距离判定
 *
 * 2026-10 浮层优化（官方 @tradingview/lwc-toolkit）：
 * - 基类换 toolkit PluginBase（同画线层）；update() 重绘请求帧合并。
 * - 价格标签从窗格内手绘 pill 改为 priceAxisViews() + toolkit AxisLabelView：
 *   标签由图表库原生渲染在价格轴上，与最新价标签同款式、同布局，不再压图。
 * - 水平线用 toolkit positionsLine 做位图像素对齐（见 lib/chart/pixel-snap）。
 */
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  Coordinate,
  IChartApiBase,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitiveAxisView,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import { PluginBase } from '@tradingview/lwc-toolkit/plugin-base';
import { AxisLabelView, type AxisLabelSource } from '@tradingview/lwc-toolkit/axis-label-view';
import { snapLineCenter } from '../chart/pixel-snap.ts';
import { createCoalescedTask } from '../scheduling/coalesced-task.ts';
import { TRADELINE_META, type TradeLineModel } from './types.ts';

/** 虚线样式 */
const DASH_PATTERN: readonly number[] = [6, 4];
/** 线宽（像素） */
const LINE_WIDTH = 1.5;

export interface TradeLinePrimitiveOptions {
  precision: number;
}

export class TradeLinePrimitive extends PluginBase {
  private model: TradeLineModel;
  private precision: number;
  /** PluginBase 的 chart/series getter 在未挂载时抛错，渲染用可空镜像做防御 */
  private chartRef?: IChartApiBase<Time>;
  private seriesRef?: ISeriesApi<SeriesType, Time>;
  private vpr = 1;
  private readonly paneView: IPrimitivePaneView;
  private readonly paneViewList: IPrimitivePaneView[];
  private readonly axisView: AxisLabelView;
  private readonly axisViewList: ISeriesPrimitiveAxisView[];
  /** update() 的重绘请求帧合并：拖拽改价时每帧最多真正 requestUpdate 一次 */
  private readonly updateCoalescer = createCoalescedTask(() => this.requestUpdate());

  constructor(model: TradeLineModel, opts: TradeLinePrimitiveOptions) {
    super();
    this.model = model;
    this.precision = opts.precision;
    this.paneView = {
      renderer: () => ({
        draw: (target: CanvasRenderingTarget2D) => this.renderAll(target),
      }),
    };
    this.paneViewList = [this.paneView];
    // 价格轴标签数据源：每次读取都取当前 model/precision，天然与状态同步
    const source: AxisLabelSource = {
      coordinate: () => {
        if (!this.seriesRef) return null;
        return this.seriesRef.priceToCoordinate(this.model.price) as Coordinate | null;
      },
      text: () =>
        `${TRADELINE_META[this.model.kind].label} ${this.model.price.toFixed(this.precision)}`,
      backColor: () => TRADELINE_META[this.model.kind].color,
      textColor: () => '#ffffff',
    };
    this.axisView = new AxisLabelView(source);
    this.axisViewList = [this.axisView];
  }

  update(model: TradeLineModel, precision: number): void {
    this.model = model;
    this.precision = precision;
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

  /** 价格轴标签：由图表库在价格轴上原生绘制（替代原窗格内手绘 pill） */
  priceAxisViews(): ISeriesPrimitiveAxisView[] {
    return this.axisViewList;
  }

  autoscaleInfo(): null {
    return null;
  }

  /** 恒不命中：拖拽命中由外层用坐标距离判定，避免干扰画线控制器 */
  hitTest(_x: number, _y: number): PrimitiveHoveredItem | null {
    return null;
  }

  private renderAll(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      this.vpr = verticalPixelRatio;
      context.save();
      context.scale(horizontalPixelRatio, verticalPixelRatio);
      this.draw(context);
      context.restore();
    });
  }

  private draw(ctx: CanvasRenderingContext2D): void {
    if (!this.chartRef || !this.seriesRef) return;
    const rawY = this.seriesRef.priceToCoordinate(this.model.price);
    if (rawY === null) return;
    const meta = TRADELINE_META[this.model.kind];
    const w = this.chartRef.chartElement().clientWidth;
    // 全宽水平线（位图像素对齐，高分屏不发虚）；标签已移交价格轴 priceAxisViews
    const y = snapLineCenter(rawY, this.vpr, LINE_WIDTH);
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.setLineDash(meta.dashed ? [...DASH_PATTERN] : []);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
