/**
 * TP/SL/挂单线的 Series Primitive 画布渲染器（lightweight-charts v5）。
 *
 * 纯渲染层：零 DOM、零 React，只依赖 lightweight-charts 类型 + ./types.ts。
 * - 全宽水平线 + 右侧价格标签（TP 绿 / SL 红 / 挂单 蓝虚线）
 * - 所有坐标只走 priceToCoordinate，跟随缩放 / 平移
 * - autoscaleInfo() 恒返回 null：不参与自动缩放
 * - hitTest() 恒返回 null：不参与图表命中判定（避免干扰 M2 画线控制器），
 *   拖拽命中由 TradeLinesLayer 用 priceToCoordinate 距离判定
 */
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  IChartApiBase,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import { TRADELINE_META, type TradeLineModel } from './types.ts';

/** 虚线样式 */
const DASH_PATTERN: readonly number[] = [6, 4];

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

export interface TradeLinePrimitiveOptions {
  precision: number;
}

export class TradeLinePrimitive implements ISeriesPrimitive<Time> {
  private model: TradeLineModel;
  private precision: number;
  private chart?: IChartApiBase<Time>;
  private series?: ISeriesApi<SeriesType, Time>;
  private requestUpdate?: () => void;
  private readonly paneView: IPrimitivePaneView;
  private readonly paneViewList: IPrimitivePaneView[];

  constructor(model: TradeLineModel, opts: TradeLinePrimitiveOptions) {
    this.model = model;
    this.precision = opts.precision;
    this.paneView = {
      renderer: () => ({
        draw: (target: CanvasRenderingTarget2D) => this.renderAll(target),
      }),
    };
    this.paneViewList = [this.paneView];
  }

  update(model: TradeLineModel, precision: number): void {
    this.model = model;
    this.precision = precision;
    this.requestUpdate?.();
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.chart = param.chart;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = undefined;
    this.series = undefined;
    this.requestUpdate = undefined;
  }

  paneViews(): IPrimitivePaneView[] {
    return this.paneViewList;
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
      context.save();
      context.scale(horizontalPixelRatio, verticalPixelRatio);
      this.draw(context);
      context.restore();
    });
  }

  private draw(ctx: CanvasRenderingContext2D): void {
    if (!this.chart || !this.series) return;
    const y = this.series.priceToCoordinate(this.model.price);
    if (y === null) return;
    const meta = TRADELINE_META[this.model.kind];
    const w = this.chart.chartElement().clientWidth;

    // 全宽水平线
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(meta.dashed ? [...DASH_PATTERN] : []);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 右侧价格标签：种类 + 价格
    const fontSize = 11;
    ctx.font = `${fontSize}px ${FONT_STACK}`;
    const text = `${meta.label} ${this.model.price.toFixed(this.precision)}`;
    const tw = ctx.measureText(text).width;
    const padX = 6;
    const pillW = tw + padX * 2;
    const pillH = 18;
    const pillX = w - pillW - 4;
    const pillY = y - pillH / 2;
    const r = 4;
    ctx.fillStyle = meta.color;
    ctx.beginPath();
    ctx.moveTo(pillX + r, pillY);
    ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, r);
    ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, r);
    ctx.arcTo(pillX, pillY + pillH, pillX, pillY, r);
    ctx.arcTo(pillX, pillY, pillX + pillW, pillY, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, pillX + padX, y + 0.5);
  }
}
