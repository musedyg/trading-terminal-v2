'use client';

// 主 K 线图表组件（契约 CONTRACTS.md §3）
// lightweight-charts v5 深色主题：蜡烛 + 底部叠加成交量柱。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from 'lightweight-charts';
import { VerticalLine } from '@tradingview/lwc-plugin-vertical-line';
import {
  BrushableAreaInteraction,
  createBrushableAreaSeries,
  type BrushableAreaRange,
} from '@tradingview/lwc-plugin-brushable-area-series';
import { paneContentElement } from '@tradingview/lwc-toolkit/dom/pane-element';
import type { Candle } from '@/lib/data/types';
import type { ToolType } from '@/lib/drawings/types';
import DrawingsLayer from './DrawingsLayer';
import TradeLinesLayer from './TradeLinesLayer';

/** 图表就绪时交出的句柄（M3 阶段 A 十字光标同步用） */
export interface ChartHandles {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
}

/** 外部同步的十字光标位置（M3 阶段 A） */
export interface SyncedCrosshair {
  time: UTCTimestamp;
  price: number;
}

/** Pine 绘图叠加（M3 阶段 B）：一条命名输出序列 */
export interface PineOverlay {
  id: string;
  color: string;
  /** true = 独立指标刻度；false = 叠加在价格主刻度 */
  separateScale: boolean;
  data: { time: UTCTimestamp; value: number | null }[];
}

/** 事件竖线（浮层优化）：官方 lwc-plugin-vertical-line，如预警触发时刻 */
export interface ChartEventLine {
  id: string;
  /** 秒级时间戳（自动吸附到最近一根 K 线） */
  time: number;
  text: string;
}

/** 刷选回测区间（浮层优化）：秒级时间戳闭区间 */
export interface BrushRange {
  from: number;
  to: number;
}

export interface PriceChartProps {
  candles: Candle[];
  precision: number;
  symbolLabel: string;
  /** M2 画线：当前激活工具（可选，不传则无画线层） */
  activeTool?: ToolType;
  /** M2 画线：当前品种/周期（决定画线持久化键） */
  symbolId?: string;
  timeframe?: string;
  /** M3 阶段 A：窗格 id，画线按窗格隔离 */
  paneId?: string;
  /** M3 阶段 A：图表创建完成回调 */
  onReady?: (handles: ChartHandles) => void;
  /** M3 阶段 A：图表销毁回调 */
  onDispose?: () => void;
  /** M3 阶段 A：十字光标移动回调（多窗格同步用） */
  onCrosshairMove?: (param: MouseEventParams) => void;
  /** M3 阶段 B：Pine 绘图叠加序列（undefined = 无） */
  pineOverlays?: PineOverlay[];
  /**
   * M3 阶段 A：外部同步的十字光标。
   * - undefined：不干预（默认，单图行为不变）
   * - null：清除程序化十字光标
   * - {time, price}：在该位置显示十字光标
   */
  syncCrosshair?: SyncedCrosshair | null;
  /** 浮层优化：事件竖线（预警触发时刻），官方 vertical-line 插件 */
  eventLines?: ChartEventLine[];
  /** 浮层优化：刷选回测模式（开启时暂停图表滚动缩放，拖动刷选区间） */
  brushEnabled?: boolean;
  /** 浮层优化：刷选区间变化回调（null = 已清除） */
  onBrushRange?: (range: BrushRange | null) => void;
}

const UP_COLOR = '#26a69a';
const DOWN_COLOR = '#ef5350';

export default function PriceChart({
  candles,
  precision,
  symbolLabel,
  activeTool,
  symbolId,
  timeframe,
  paneId,
  onReady,
  onDispose,
  onCrosshairMove,
  syncCrosshair,
  pineOverlays,
  eventLines,
  brushEnabled,
  onBrushRange,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const dataKeyRef = useRef<string>('');
  // M3 阶段 B：Pine 叠加线系列（id → series）
  const pineSeriesRef = useRef(new Map<string, ISeriesApi<'Line'>>());
  // 回调用 ref 中转，避免创建 effect 闭包过期
  const moveCbRef = useRef(onCrosshairMove);
  moveCbRef.current = onCrosshairMove;
  // 浮层优化：事件竖线 primitive（id → VerticalLine）
  const eventPrimsRef = useRef(new Map<string, VerticalLine>());
  const brushCbRef = useRef(onBrushRange);
  brushCbRef.current = onBrushRange;
  // 浮层优化：品种标签 DOM —— 经 toolkit paneContentElement 挂进窗格画布容器，
  // 与画布共享坐标空间（替代原先外层 React 绝对定位 div，自己算位置易错位）
  const labelElRef = useRef<HTMLDivElement | null>(null);
  const symbolLabelRef = useRef(symbolLabel);
  symbolLabelRef.current = symbolLabel;

  const mountLabel = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || labelElRef.current) return;
    const pane = chart.panes()[0];
    if (!pane) return;
    const host = paneContentElement(pane);
    if (!host) return; // 窗格 DOM 尚未生成，下一次数据更新时重试
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;top:8px;left:12px;z-index:5;pointer-events:none;font-size:14px;font-weight:600;color:#d1d4dc;';
    el.textContent = symbolLabelRef.current;
    host.appendChild(el);
    labelElRef.current = el;
  }, []);
  // M2 画线层要用的 chart/series 实例（创建 effect 里 set，卸载时清）
  const [chartHandles, setChartHandles] = useState<{
    chart: IChartApi;
    series: ISeriesApi<'Candlestick'>;
  } | null>(null);

  // 创建图表（只执行一次）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42,46,57,0.5)' },
        horzLines: { color: 'rgba(42,46,57,0.5)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: 'rgba(42,46,57,1)' },
      rightPriceScale: { borderColor: 'rgba(42,46,57,1)' },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      borderVisible: false,
      priceFormat: {
        type: 'price',
        precision,
        minMove: Math.pow(10, -precision),
      },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: '',
    });
    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    /* M2: drawings layer slot — 画线层挂载点（系列创建之后、ResizeObserver 之前） */
    setChartHandles({ chart, series: candleSeries });
    // M3 阶段 A：把句柄交给父组件（十字光标同步用）
    onReady?.({ chart, series: candleSeries });

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    resizeObserver.observe(container);

    // M3 阶段 A：十字光标移动事件（多窗格同步用）
    const moveHandler = (param: MouseEventParams) => {
      moveCbRef.current?.(param);
    };
    chart.subscribeCrosshairMove(moveHandler);

    // 浮层优化：尝试挂载品种标签（此刻窗格 DOM 可能还没生成，数据 effect 会重试）
    mountLabel();

    return () => {
      chart.unsubscribeCrosshairMove(moveHandler);
      resizeObserver.disconnect();
      labelElRef.current?.remove();
      labelElRef.current = null;
      eventPrimsRef.current.clear();
      setChartHandles(null);
      onDispose?.();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // M3 阶段 A：外部同步十字光标（undefined = 不干预）
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series || syncCrosshair === undefined) return;
    if (syncCrosshair === null) {
      chart.clearCrosshairPosition();
    } else {
      chart.setCrosshairPosition(syncCrosshair.price, syncCrosshair.time, series);
    }
  }, [syncCrosshair]);

  // M3 阶段 B：Pine 绘图叠加（每条命名输出一条 LineSeries）
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const map = pineSeriesRef.current;
    const wanted = new Map((pineOverlays ?? []).map((o) => [o.id, o]));
    // 删除不再需要的
    for (const [id, s] of map) {
      if (!wanted.has(id)) {
        chart.removeSeries(s);
        map.delete(id);
      }
    }
    // 新增 / 更新
    for (const [id, o] of wanted) {
      let s = map.get(id);
      const scaleId = o.separateScale ? 'pine' : 'right';
      if (!s) {
        s = chart.addSeries(LineSeries, {
          color: o.color,
          lineWidth: 2,
          priceScaleId: scaleId,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: true,
        });
        if (o.separateScale) {
          chart.priceScale('pine').applyOptions({
            scaleMargins: { top: 0.15, bottom: 0.15 },
          });
        }
        map.set(id, s);
      } else {
        s.applyOptions({ color: o.color, priceScaleId: scaleId });
      }
      // null 值跳过（连线不断裂过大段空白，简单起见直接过滤）
      s.setData(
        o.data
          .filter((p) => typeof p.value === 'number' && Number.isFinite(p.value))
          .map((p) => ({ time: p.time, value: p.value as number })),
      );
    }
  }, [pineOverlays]);

  // 浮层优化：品种标签文本同步
  useEffect(() => {
    if (labelElRef.current) labelElRef.current.textContent = symbolLabel;
  }, [symbolLabel]);

  // 浮层优化：事件竖线（官方 lwc-plugin-vertical-line）—— 按 id diff 增删
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series || !chartHandles) return;
    const map = eventPrimsRef.current;
    const wanted = new Map((eventLines ?? []).map((e) => [e.id, e]));
    for (const [id, prim] of map) {
      if (!wanted.has(id)) {
        series.detachPrimitive(prim);
        map.delete(id);
      }
    }
    for (const [id, e] of wanted) {
      if (map.has(id)) continue;
      const prim = new VerticalLine(e.time as UTCTimestamp, {
        color: '#f0b90b',
        width: 1,
        lineStyle: LineStyle.Dashed,
        showLabel: true,
        labelText: e.text,
        snap: 'nearest',
        badge: { text: e.text, backgroundColor: '#f0b90b', color: '#131722' },
      });
      series.attachPrimitive(prim);
      map.set(id, prim);
    }
  }, [eventLines, chartHandles]);

  // 浮层优化：刷选回测区间（官方 lwc-plugin-brushable-area-series）
  // 开启时叠加一层收盘价面积图供拖动刷选，并暂停图表滚动/缩放（手势与刷选冲突，插件官方要求）；
  // 关闭/数据变更时整层拆除并回报区间清除。
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartHandles || !brushEnabled) return;
    const base = candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : 0;
    const brushSeries = createBrushableAreaSeries(chart, {
      priceScaleId: '',
      lineVisible: true,
      lineColor: 'rgba(41,98,255,0.85)',
      lineWidth: 1,
      topColor: 'rgba(41,98,255,0.22)',
      bottomColor: 'rgba(41,98,255,0.03)',
      basePrice: base,
      outsideStyle: {
        lineColor: 'rgba(41,98,255,0.30)',
        topColor: 'rgba(41,98,255,0.05)',
        bottomColor: 'rgba(41,98,255,0.01)',
      },
    });
    brushSeries.setData(
      candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })),
    );
    const brush = new BrushableAreaInteraction({ minimumRangeWidth: 2 });
    brushSeries.attachPrimitive(brush);
    const onRange = (r: BrushableAreaRange | null) => {
      if (r && r.fromTime !== null && r.toTime !== null) {
        brushCbRef.current?.({ from: Number(r.fromTime), to: Number(r.toTime) });
      } else if (!r) {
        brushCbRef.current?.(null);
      }
    };
    brush.activeRange().subscribe(onRange);
    chart.applyOptions({ handleScroll: false, handleScale: false });
    return () => {
      brush.activeRange().unsubscribe(onRange);
      brushCbRef.current?.(null);
      brushSeries.detachPrimitive(brush);
      chart.removeSeries(brushSeries);
      chart.applyOptions({ handleScroll: true, handleScale: true });
    };
  }, [brushEnabled, candles, chartHandles]);

  // 数据 / 精度更新
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;
    mountLabel();

    candleSeries.applyOptions({
      priceFormat: {
        type: 'price',
        precision,
        minMove: Math.pow(10, -precision),
      },
    });

    const candleData = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const volumeData = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
    }));

    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    /* M3: indicator panes slot — 指标窗格挂载点（价格系列之后、fitContent 之前） */

    // 仅当数据实质变化时重适配，避免精度微调时打断用户缩放
    const key = candles.length > 0 ? `${candles[0].time}-${candles[candles.length - 1].time}-${candles.length}` : '';
    if (key !== dataKeyRef.current) {
      dataKeyRef.current = key;
      if (candles.length > 0) {
        chartRef.current?.timeScale().fitContent();
      }
    }
  }, [candles, precision]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />
      {/* M2: drawings layer — 画线交互层（覆盖层，不拦截图表手势） */}
      {chartHandles && activeTool !== undefined && symbolId !== undefined && timeframe !== undefined && (
        <DrawingsLayer
          chart={chartHandles.chart}
          series={chartHandles.series}
          activeTool={activeTool}
          symbolId={symbolId}
          timeframe={timeframe}
          precision={precision}
          paneId={paneId}
        />
      )}
      {/* M3: multi-chart grid slot — 多图网格挂载点（同级覆盖层 / 网格容器位置） */}
      {/* M3 阶段 C：TP/SL/挂单线层（可拖拽水平线） */}
      {chartHandles && symbolId !== undefined && timeframe !== undefined && (
        <TradeLinesLayer
          chart={chartHandles.chart}
          series={chartHandles.series}
          symbolId={symbolId}
          timeframe={timeframe}
          precision={precision}
          paneId={paneId}
        />
      )}
      {candles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm text-[#787b86]">暂无数据</span>
        </div>
      )}
      {/* 品种标签已改为经 paneContentElement 挂进窗格画布容器（见 mountLabel），此处不再渲染 */}
    </div>
  );
}
