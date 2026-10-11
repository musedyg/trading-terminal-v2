'use client';

// 单个图表窗格（M3 阶段 A）：独立品种 + 周期 + 数据加载 + 画线（按窗格隔离）
// 点击窗格任意位置将其设为活动窗格；画线工具只作用于活动窗格。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEventParams } from 'lightweight-charts';
import PriceChart, { type ChartHandles, type PineOverlay, type SyncedCrosshair } from './PriceChart';
import SymbolSearch from './SymbolSearch';
import { SYMBOLS, TIMEFRAMES, type SymbolInfo } from '@/lib/symbols';
import type { PaneState } from '@/lib/layout/types';
import type { ToolType } from '@/lib/drawings/types';
import type { Candle } from '@/lib/data/types';
import { precisionForPrice } from '@/lib/format';
import { strings } from '@/lib/i18n';

export interface ChartPaneProps {
  pane: PaneState;
  isActive: boolean;
  /** 全局画线工具；仅活动窗格接收真实值，非活动窗格强制 'select' */
  activeTool: ToolType;
  onActivate: () => void;
  onPaneChange: (patch: Partial<PaneState>) => void;
  registerChart: (paneId: string, handles: ChartHandles) => void;
  unregisterChart: (paneId: string) => void;
  onCrosshairMove: (paneId: string, param: MouseEventParams) => void;
  syncCrosshair: SyncedCrosshair | null | undefined;
  /** M3 阶段 B：Pine 绘图叠加（仅活动窗格传入） */
  pineOverlays?: PineOverlay[];
  /** M3 阶段 B：K 线数据就绪/更新时上报（供 Pine 面板使用） */
  onData?: (paneId: string, candles: Candle[]) => void;
}

export default function ChartPane({
  pane,
  isActive,
  activeTool,
  onActivate,
  onPaneChange,
  registerChart,
  unregisterChart,
  onCrosshairMove,
  syncCrosshair,
  pineOverlays,
  onData,
}: ChartPaneProps) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [failover, setFailover] = useState(false);

  const symbol: SymbolInfo = SYMBOLS.find((s) => s.id === pane.symbolId) ?? SYMBOLS[0];
  const precision = candles.length > 0 ? precisionForPrice(candles[candles.length - 1].close) : 4;

  const loadKlines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/klines?symbol=${encodeURIComponent(symbol.id)}&timeframe=${pane.timeframe}`;
      const res = await fetch(url);
      const body = await res.json();
      if (!body.ok) {
        throw new Error(body.error || `请求失败 (${res.status})`);
      }
      setCandles(body.candles ?? []);
      setSourceLabel(body.sourceLabel ?? '');
      setFailover(Boolean(body.failover));
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.loadError);
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, pane.timeframe]);

  useEffect(() => {
    loadKlines();
  }, [loadKlines]);

  // M3 阶段 B：数据更新时上报给父组件（Pine 面板用）
  const dataCbRef = useRef(onData);
  dataCbRef.current = onData;
  useEffect(() => {
    dataCbRef.current?.(pane.id, candles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, pane.id]);

  const handleReady = useCallback(
    (h: ChartHandles) => registerChart(pane.id, h),
    [pane.id, registerChart],
  );
  const handleDispose = useCallback(() => unregisterChart(pane.id), [pane.id, unregisterChart]);
  const handleMove = useCallback(
    (p: MouseEventParams) => onCrosshairMove(pane.id, p),
    [pane.id, onCrosshairMove],
  );

  return (
    <div
      onMouseDown={onActivate}
      className={`flex flex-col min-h-0 min-w-0 h-full border ${
        isActive ? 'border-[#2962ff]' : 'border-[#2a2e39]'
      }`}
    >
      {/* 窗格头：品种搜索 + 周期 + 数据源 */}
      <div className="flex items-center gap-1.5 h-10 px-2 border-b border-[#2a2e39] shrink-0 bg-[#131722]">
        <SymbolSearch
          compact
          symbol={symbol}
          onPick={(s) => onPaneChange({ symbolId: s.id })}
        />
        <div className="flex items-center gap-0.5 ml-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => onPaneChange({ timeframe: tf })}
              className={`h-7 px-1.5 rounded text-xs ${
                tf === pane.timeframe
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#b2b5be] hover:bg-[#2a2e39]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-[#787b86] truncate max-w-28" title={sourceLabel}>
          {sourceLabel}
          {failover && <span className="ml-1 text-[#f0b90b]">备</span>}
        </span>
      </div>

      {/* 图表区 */}
      <div className="relative flex-1 min-h-0">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#131722]/60">
            <span className="text-sm text-[#787b86]">{strings.loading}</span>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#131722]">
            <span className="text-sm text-[#ef5350]">{error}</span>
            <button
              onClick={loadKlines}
              className="h-8 px-4 rounded text-sm bg-[#2962ff] text-white hover:bg-[#1e53e5]"
            >
              {strings.retry}
            </button>
          </div>
        )}
        <PriceChart
          candles={candles}
          precision={precision}
          symbolLabel={symbol.label}
          activeTool={isActive ? activeTool : 'select'}
          symbolId={pane.symbolId}
          timeframe={pane.timeframe}
          paneId={pane.id}
          onReady={handleReady}
          onDispose={handleDispose}
          onCrosshairMove={handleMove}
          syncCrosshair={syncCrosshair}
          pineOverlays={pineOverlays}
        />
      </div>
    </div>
  );
}
