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
import type { ChartHandles, PineOverlay, SyncedCrosshair } from './PriceChart';
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

  return (
    <div className={`grid ${GRID_CLASS[paneCount]} gap-1 flex-1 min-h-0 p-1 bg-[#0e1016]`}>
      {visible.map((pane) => (
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
        />
      ))}
    </div>
  );
}
