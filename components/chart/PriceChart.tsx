'use client';

// 主 K 线图表组件（契约 CONTRACTS.md §3）
// lightweight-charts v5 深色主题：蜡烛 + 底部叠加成交量柱。

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from 'lightweight-charts';
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

    return () => {
      chart.unsubscribeCrosshairMove(moveHandler);
      resizeObserver.disconnect();
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

  // 数据 / 精度更新
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;

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
      <div className="absolute top-2 left-3 pointer-events-none select-none">
        <span className="text-sm font-semibold text-[#d1d4dc]">{symbolLabel}</span>
      </div>
    </div>
  );
}
