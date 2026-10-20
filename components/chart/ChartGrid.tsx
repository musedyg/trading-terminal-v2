'use client';

// 多图网格（M3 阶段 A）：1/2/4/6 分屏 + 十字光标同步。
// 同步原理：订阅每窗格图表的 crosshairMove，源窗格移动时用原生
// setCrosshairPosition 把其他窗格的十字光标放到同一时间/价格；
// 鼠标离开源窗格时 clearCrosshairPosition。程序化设置不触发事件，
// 另加 syncing 守卫防循环。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEventParams, UTCTimestamp } from 'lightweight-charts';
import ChartPane from './ChartPane';
import type { Candle } from '@/lib/data/types';
import type {
  BrushRange,
  ChartEventLine,
  ChartHandles,
  PineOverlay,
  SyncedCrosshair,
} from './PriceChart';
import type { PaneCount, PaneState } from '@/lib/layout/types';
import type { ToolType } from '@/lib/drawings/types';

export interface ChartGridProps {
  panes: PaneState[];
  paneCount: PaneCount;
  activePaneId: string;
  activeTool: ToolType;
  crosshairSync: boolean;
  onActivatePane: (id: string) => void;
  onPaneChange: (id: string, patch: Partial<PaneState>) => void;
  /** M3 阶段 B：Pine 绘图叠加（只渲染在活动窗格） */
  pineOverlays?: PineOverlay[];
  /** M3 阶段 B：窗格 K 线数据上报 */
  onPaneData?: (paneId: string, candles: Candle[]) => void;
  /** 浮层优化：已触发预警的事件竖线（各窗格按品种过滤） */
  eventLines?: (ChartEventLine & { symbolId: string })[];
  /** 浮层优化：刷选回测模式（只作用于活动窗格） */
  brushMode?: boolean;
  /** 浮层优化：刷选区间变化回调 */
  onBrushRange?: (range: BrushRange | null) => void;
}

const GRID_CLASS: Record<PaneCount, string> = {
  1: 'grid-cols-1 grid-rows-1',
  2: 'grid-cols-2 grid-rows-1',
  4: 'grid-cols-2 grid-rows-2',
  6: 'grid-cols-3 grid-rows-2',
};

export default function ChartGrid({
  panes,
  paneCount,
  activePaneId,
  activeTool,
  crosshairSync,
  onActivatePane,
  onPaneChange,
  pineOverlays,
  onPaneData,
  eventLines,
  brushMode,
  onBrushRange,
}: ChartGridProps) {
  const handlesRef = useRef(new Map<string, ChartHandles>());
  const sourceRef = useRef<string | null>(null);
  const syncingRef = useRef(false);
  const syncOnRef = useRef(crosshairSync);
  syncOnRef.current = crosshairSync;
  const [syncPositions, setSyncPositions] = useState<Record<string, SyncedCrosshair | null>>({});

  const registerChart = useCallback((paneId: string, handles: ChartHandles) => {
    handlesRef.current.set(paneId, handles);
  }, []);

  const unregisterChart = useCallback((paneId: string) => {
    handlesRef.current.delete(paneId);
    if (sourceRef.current === paneId) sourceRef.current = null;
    setSyncPositions((prev) => {
      if (!(paneId in prev)) return prev;
      const next = { ...prev };
      delete next[paneId];
      return next;
    });
  }, []);

  const handleCrosshairMove = useCallback((paneId: string, param: MouseEventParams) => {
    if (!syncOnRef.current || syncingRef.current) return;

    // 鼠标离开图表：清除其他窗格的同步十字光标
    if (param.point === undefined || param.time === undefined) {
      if (sourceRef.current === paneId) {
        sourceRef.current = null;
        const clears: Record<string, null> = {};
        for (const id of handlesRef.current.keys()) {
          if (id !== paneId) clears[id] = null;
        }
        setSyncPositions(clears);
      }
      return;
    }

    const src = handlesRef.current.get(paneId);
    if (!src) return;
    // 光标处的实际价格（用源窗格自身的价格轴换算）
    const price = src.series.coordinateToPrice(param.point.y);
    if (price === null) return;

    sourceRef.current = paneId;
    syncingRef.current = true;
    try {
      const next: Record<string, SyncedCrosshair> = {};
      for (const id of handlesRef.current.keys()) {
        if (id === paneId) continue;
        next[id] = { time: param.time as UTCTimestamp, price };
      }
      setSyncPositions(next);
    } finally {
      syncingRef.current = false;
    }
  }, []);

  // 同步开关关闭时：清除所有程序化十字光标
  useEffect(() => {
    if (!crosshairSync) {
      sourceRef.current = null;
      const clears: Record<string, null> = {};
      for (const id of handlesRef.current.keys()) clears[id] = null;
      setSyncPositions(clears);
    }
  }, [crosshairSync]);

  const visible = panes.slice(0, paneCount);

  // 分屏错峰挂载：窗格数增加时逐个放行（约 200ms 一个），避免多张图表在同一
  // 瞬间并发创建 + 拉数据 + 渲染，把标签页进程峰值顶崩；减少窗格时立即生效。
  // 网格模板尺寸由 GRID_CLASS 固定，未挂载的格子先空着，已挂载窗格不跳位。
  const [revealed, setRevealed] = useState(visible.length);
  useEffect(() => {
    if (revealed > visible.length) {
      setRevealed(visible.length);
      return;
    }
    if (revealed === visible.length) return;
    const t = window.setTimeout(() => setRevealed((r) => r + 1), 200);
    return () => window.clearTimeout(t);
  }, [revealed, visible.length]);
  const shownPanes = visible.slice(0, revealed);

  return (
    <div className={`grid ${GRID_CLASS[paneCount]} gap-1 flex-1 min-h-0 p-1 bg-[#0e1016]`}>
      {shownPanes.map((pane) => (
        <ChartPane
          key={pane.id}
          pane={pane}
          isActive={pane.id === activePaneId}
          activeTool={activeTool}
          onActivate={() => onActivatePane(pane.id)}
          onPaneChange={(patch) => onPaneChange(pane.id, patch)}
          registerChart={registerChart}
          unregisterChart={unregisterChart}
          onCrosshairMove={handleCrosshairMove}
          syncCrosshair={syncPositions[pane.id]}
          pineOverlays={pane.id === activePaneId ? pineOverlays : undefined}
          onData={onPaneData}
          eventLines={eventLines}
          brushEnabled={brushMode === true && pane.id === activePaneId}
          onBrushRange={pane.id === activePaneId ? onBrushRange : undefined}
        />
      ))}
    </div>
  );
}
