'use client';

// TP/SL/挂单线层（M3 阶段 C）：可拖拽的水平线，参考 M2 画线的 Series Primitive 做法。
// - 每条线是一个挂在蜡烛系列上的 primitive（hitTest 恒 null，不干扰 M2 画线控制器）
// - 拖拽命中由本层用 priceToCoordinate 距离判定；拖拽期间冻结图表滚动缩放
// - 按窗格 + 品种 + 周期持久化到 localStorage
// - 覆盖在 PriceChart 上，不拦截图表手势（控制条除外）

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { TradeLinePrimitive } from '@/lib/tradelines/TradeLinePrimitive';
import { TradeLineStore } from '@/lib/tradelines/store';
import {
  createTradeLineId,
  tradeLinesKey,
  TRADELINE_META,
  type TradeLineKind,
  type TradeLineModel,
} from '@/lib/tradelines/types';
import { strings } from '@/lib/i18n';

export interface TradeLinesLayerProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  symbolId: string;
  timeframe: string;
  precision: number;
  /** M3 阶段 A：窗格 id，线按窗格隔离 */
  paneId?: string;
}

/** 拖拽命中容差（像素） */
const HIT_TOLERANCE = 8;

const KIND_ORDER: TradeLineKind[] = ['tp', 'sl', 'order'];

export default function TradeLinesLayer({
  chart,
  series,
  symbolId,
  timeframe,
  precision,
  paneId = 'pane-0',
}: TradeLinesLayerProps) {
  const keyFor = (s: string, t: string) => tradeLinesKey(s, t, paneId);
  const storeRef = useRef<TradeLineStore | null>(null);
  const primsRef = useRef(new Map<string, TradeLinePrimitive>());
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const keyRef = useRef(keyFor(symbolId, timeframe));
  const precisionRef = useRef(precision);
  precisionRef.current = precision;
  // 触发控制条重渲染（线列表变化时）
  const [, setVersion] = useState(0);

  // 同步 store → primitive（增删改全量 diff）
  const syncPrimitives = () => {
    const store = storeRef.current;
    if (!store) return;
    const seen = new Set<string>();
    for (const m of store.list()) {
      seen.add(m.id);
      const existing = primsRef.current.get(m.id);
      if (existing) {
        existing.update(m, precisionRef.current);
      } else {
        const prim = new TradeLinePrimitive(m, { precision: precisionRef.current });
        series.attachPrimitive(prim);
        primsRef.current.set(m.id, prim);
      }
    }
    for (const [id, prim] of primsRef.current) {
      if (!seen.has(id)) {
        series.detachPrimitive(prim);
        primsRef.current.delete(id);
      }
    }
  };

  // 创建：chart/series 就绪后一次；绑定鼠标事件
  useEffect(() => {
    const store = new TradeLineStore();
    storeRef.current = store;
    keyRef.current = keyFor(symbolId, timeframe);
    for (const m of TradeLineStore.load(keyRef.current)) store.add(m);
    syncPrimitives();
    const unsub = store.subscribe(() => {
      syncPrimitives();
      setVersion((v) => v + 1);
    });

    const el = chart.chartElement();

    /** 相对 chart 容器的 y（CSS 像素） */
    const relY = (clientY: number): number => {
      const rect = el.getBoundingClientRect();
      return clientY - rect.top;
    };

    /** 找到 y 附近的线（容差内最近的一条） */
    const hitLine = (y: number): TradeLineModel | null => {
      let best: TradeLineModel | null = null;
      let bestDist = HIT_TOLERANCE;
      for (const m of store.list()) {
        const ly = series.priceToCoordinate(m.price);
        if (ly === null) continue;
        const d = Math.abs(y - ly);
        if (d <= bestDist) {
          bestDist = d;
          best = m;
        }
      }
      return best;
    };

    const freezeChart = (freeze: boolean) => {
      chart.applyOptions({ handleScroll: !freeze, handleScale: !freeze });
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || dragRef.current) return;
      const hit = hitLine(relY(e.clientY));
      if (!hit) return;
      dragRef.current = { id: hit.id, moved: false };
      freezeChart(true);
      el.style.cursor = 'ns-resize';
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const price = series.coordinateToPrice(relY(e.clientY));
      if (price === null) return;
      drag.moved = true;
      store.updatePrice(drag.id, price);
    };

    const onMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      freezeChart(false);
      el.style.cursor = '';
      if (drag.moved) store.save(keyRef.current);
    };

    const onDblClick = (e: MouseEvent) => {
      const hit = hitLine(relY(e.clientY));
      if (hit && store.remove(hit.id)) {
        store.save(keyRef.current);
      }
    };

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('dblclick', onDblClick);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      unsub();
      for (const prim of primsRef.current.values()) series.detachPrimitive(prim);
      primsRef.current.clear();
      storeRef.current = null;
      dragRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series]);

  // 品种/周期/窗格切换：重载该键下的线
  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    keyRef.current = keyFor(symbolId, timeframe);
    store.clear();
    for (const m of TradeLineStore.load(keyRef.current)) store.add(m);
    syncPrimitives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolId, timeframe, paneId]);

  // 精度变化：刷新标签
  useEffect(() => {
    syncPrimitives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precision]);

  /** 在可视区域约 40% 高度处新增一条线 */
  const addLine = (kind: TradeLineKind) => {
    const store = storeRef.current;
    if (!store) return;
    const el = chart.chartElement();
    const price = series.coordinateToPrice(el.clientHeight * 0.4) ?? 0;
    if (!Number.isFinite(price) || price <= 0) return;
    store.add({ id: createTradeLineId(), kind, price });
    store.save(keyRef.current);
  };

  const removeLine = (id: string) => {
    const store = storeRef.current;
    if (store?.remove(id)) store.save(keyRef.current);
  };

  const lines = storeRef.current?.list() ?? [];

  return (
    <div className="absolute inset-0 z-10 pointer-events-none select-none">
      {/* 添加控制条：右上角，不遮挡品种标签（左上） */}
      <div className="absolute top-2 right-2 flex items-center gap-1 pointer-events-auto">
        {KIND_ORDER.map((k) => (
          <button
            key={k}
            title={`${strings.tradeLineAddHint}${TRADELINE_META[k].label}`}
            onClick={() => addLine(k)}
            className="h-7 px-2 rounded text-xs border bg-[#1e222d]/90 border-[#2a2e39] text-[#b2b5be] hover:bg-[#2a2e39]"
          >
            <span style={{ color: TRADELINE_META[k].color }}>＋</span>
            {TRADELINE_META[k].label}
          </button>
        ))}
      </div>
      {/* 线列表（可删除）：右上控制条下方 */}
      {lines.length > 0 && (
        <div className="absolute top-10 right-2 flex flex-col gap-1 pointer-events-auto">
          {lines.map((m) => (
            <div
              key={m.id}
              title={strings.tradeLineDragHint}
              className="flex items-center gap-1.5 h-6 pl-2 pr-1 rounded text-[11px] bg-[#1e222d]/90 border border-[#2a2e39] text-[#b2b5be]"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: TRADELINE_META[m.kind].color }}
              />
              <span>{TRADELINE_META[m.kind].label}</span>
              <span className="text-[#d1d4dc]">{m.price.toFixed(precision)}</span>
              <button
                onClick={() => removeLine(m.id)}
                title={strings.drawingDelete}
                className="w-5 h-5 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#f23645]"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
