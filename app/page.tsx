'use client';

// 主页面（M3 阶段 A）：深色看盘布局 + 多图分屏 + 命名布局。
// 顶栏（分屏切换 + 十字同步 + 布局菜单 + 指标占位）→ 左侧画线工具栏 → 多图网格 → Footer。

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ChartGrid from '@/components/chart/ChartGrid';
import LayoutMenu from '@/components/layout/LayoutMenu';
import PinePanel from '@/components/pine/PinePanel';
import AlertPanel from '@/components/alerts/AlertPanel';
import TradePanel from '@/components/trade/TradePanel';
import { AlertStore } from '@/lib/alerts/store';
import {
  createAlertId,
  isAlertTriggered,
  type AlertDirection,
  type AlertModel,
} from '@/lib/alerts/types';
import { playAlertSound } from '@/lib/alerts/sound';
import { precisionForPrice } from '@/lib/format';
import type { BrushRange, PineOverlay } from '@/components/chart/PriceChart';
import {
  PANE_COUNTS,
  defaultPanes,
  normalizePanes,
  loadLayouts,
  saveLayouts,
  createLayoutId,
  type NamedLayout,
  type PaneCount,
  type PaneState,
} from '@/lib/layout/types';
import { SYMBOLS, resolveSymbol } from '@/lib/symbols';
import type { Candle } from '@/lib/data/types';
import { strings } from '@/lib/i18n';
import type { ToolType } from '@/lib/drawings/types';

// 左侧工具栏：M2 画线工具（10 个，TV 原生布局：选择 + 9 种画线）
const TOOL_ICONS: { key: ToolType; title: string; svg: ReactNode }[] = [
  { key: 'select', title: strings.toolSelect, svg: <path d="M6 3 L18 12 L12.5 13 L9.5 20 Z" /> },
  { key: 'trend', title: strings.toolTrend, svg: <path d="M4 20 L20 4" /> },
  { key: 'ray', title: strings.toolRay, svg: <path d="M4 18 L19 5 M14 5 h5 v5" /> },
  { key: 'hline', title: strings.toolHLine, svg: <path d="M3 12 H21 M5 9 v6 M19 9 v6" /> },
  { key: 'rect', title: strings.toolRect, svg: <rect x="4" y="7" width="16" height="10" /> },
  { key: 'fibo', title: strings.toolFibo, svg: <path d="M5 18 h14 M7 13 h10 M9 8 h6" /> },
  { key: 'channel', title: strings.toolChannel, svg: <path d="M4 15 L15 4 M9 20 L20 9" /> },
  { key: 'long', title: strings.toolLong, svg: <path d="M12 20 V5 M6.5 10.5 L12 5 L17.5 10.5" /> },
  { key: 'short', title: strings.toolShort, svg: <path d="M12 4 V19 M6.5 13.5 L12 19 L17.5 13.5" /> },
  { key: 'text', title: strings.toolText, svg: <path d="M6 5 h12 M12 5 v14" /> },
];

export default function Home() {
  const [paneCount, setPaneCount] = useState<PaneCount>(1);
  const [panes, setPanes] = useState<PaneState[]>(() => defaultPanes(1));
  const [activePaneId, setActivePaneId] = useState<string>('pane-0');
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [crosshairSync, setCrosshairSync] = useState<boolean>(true);
  const [layouts, setLayouts] = useState<NamedLayout[]>(() => loadLayouts());
  // M3 阶段 B：Pine 面板
  const [pineOpen, setPineOpen] = useState<boolean>(false);
  const [pineOverlays, setPineOverlays] = useState<PineOverlay[]>([]);
  // 浮层优化：刷选回测区间（活动窗格图表上拖动刷选，喂给 Pine 运行/回测）
  const [brushMode, setBrushMode] = useState<boolean>(false);
  const [brushRange, setBrushRange] = useState<BrushRange | null>(null);
  // M3 阶段 C：预警 + 模拟交易
  const [alertOpen, setAlertOpen] = useState<boolean>(false);
  const [tradeOpen, setTradeOpen] = useState<boolean>(false);
  const [alerts, setAlerts] = useState<AlertModel[]>(() => AlertStore.load());
  const [banner, setBanner] = useState<{ title: string; detail: string } | null>(null);
  const alertStoreRef = useRef<AlertStore | null>(null);
  if (!alertStoreRef.current) {
    const s = new AlertStore();
    for (const a of AlertStore.load()) s.add(a);
    alertStoreRef.current = s;
  }
  const bannerTimerRef = useRef<number | null>(null);
  const paneDataRef = useRef(new Map<string, Candle[]>());
  const [, setDataVersion] = useState(0);

  const changePaneCount = useCallback((count: PaneCount) => {
    setPaneCount(count);
    setPanes((prev) => normalizePanes(prev, count));
    setActivePaneId((cur) => {
      const idx = Number(cur.split('-')[1]);
      return Number.isFinite(idx) && idx < count ? cur : 'pane-0';
    });
  }, []);

  const changePane = useCallback((id: string, patch: Partial<PaneState>) => {
    setPanes((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const persistLayouts = useCallback((list: NamedLayout[]) => {
    setLayouts(list);
    saveLayouts(list);
  }, []);

  const saveLayout = useCallback(
    (name: string) => {
      const now = Date.now();
      const layout: NamedLayout = {
        id: createLayoutId(),
        name,
        paneCount,
        panes: panes.slice(0, paneCount).map((p) => ({ ...p })),
        createdAt: now,
        updatedAt: now,
      };
      persistLayouts([...layouts, layout]);
    },
    [layouts, paneCount, panes, persistLayouts],
  );

  const loadLayout = useCallback(
    (layout: NamedLayout) => {
      setPaneCount(layout.paneCount);
      setPanes(layout.panes.map((p) => ({ ...p })));
      setActivePaneId('pane-0');
    },
    [],
  );

  const renameLayout = useCallback(
    (id: string, name: string) => {
      persistLayouts(
        layouts.map((l) => (l.id === id ? { ...l, name, updatedAt: Date.now() } : l)),
      );
    },
    [layouts, persistLayouts],
  );

  const deleteLayout = useCallback(
    (id: string) => {
      persistLayouts(layouts.filter((l) => l.id !== id));
    },
    [layouts, persistLayouts],
  );

  const activePane = panes.find((p) => p.id === activePaneId) ?? panes[0];
  const activeSymbol = (activePane ? resolveSymbol(activePane.symbolId) : undefined) ?? SYMBOLS[0];

  // M3 阶段 B：窗格数据上报（Pine 面板取活动窗格 K 线）
  // 注意：只有活动窗格的数据被消费（Pine 面板 + 预警检查都只读活动窗格）。
  // 非活动窗格只静静更新 ref —— 否则切分屏时 N 个新窗格同时上报会引发
  // N 次整页重渲染，与 N 张图表的创建挤在同一瞬间，峰值能把标签页进程顶崩。
  const activePaneIdRef = useRef(activePaneId);
  activePaneIdRef.current = activePaneId;
  const handlePaneData = useCallback((paneId: string, candles: Candle[]) => {
    paneDataRef.current.set(paneId, candles);
    if (paneId === activePaneIdRef.current) {
      setDataVersion((v) => v + 1);
    }
  }, []);

  // M3 阶段 B：活动窗格品种/周期变化时清空 Pine 叠加（避免旧图残留）
  const activeKey = `${activePane?.symbolId ?? ''}::${activePane?.timeframe ?? ''}`;
  useEffect(() => {
    setPineOverlays([]);
    setBrushRange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  // 浮层优化：已触发预警 → 事件竖线（各窗格按品种过滤后画在触发时刻）
  const eventLines = useMemo(
    () =>
      alerts
        .filter((a) => a.triggeredAt !== null)
        .map((a) => ({
          id: a.id,
          symbolId: a.symbolId,
          time: Math.floor((a.triggeredAt as number) / 1000),
          text: strings.alertEventLine,
        })),
    [alerts],
  );

  // 浮层优化：刷选区间回调（选出区间后自动打开 Pine 面板承接回测）
  const handleBrushRange = useCallback((range: BrushRange | null) => {
    setBrushRange(range);
    if (range) setPineOpen(true);
  }, []);

  // M3 阶段 C：预警 store 变更 → 刷新列表 + 持久化
  useEffect(() => {
    const store = alertStoreRef.current;
    if (!store) return;
    return store.subscribe(() => {
      setAlerts(store.list());
      store.save();
    });
  }, []);

  // M3 阶段 C：预警触发检查 —— 每 2 秒用活动窗格最新收盘价检查
  useEffect(() => {
    const check = () => {
      const store = alertStoreRef.current;
      if (!store) return;
      if (document.hidden) return; // 标签页在后台时不做检查，多标签并开时省资源
      const candles = paneDataRef.current.get(activePaneId);
      const last = candles && candles.length > 0 ? candles[candles.length - 1] : undefined;
      if (!last) return;
      const symId = panes.find((p) => p.id === activePaneId)?.symbolId ?? '';
      let fired: AlertModel | null = null;
      for (const a of store.list()) {
        if (a.triggeredAt !== null || a.symbolId !== symId) continue;
        if (isAlertTriggered(a, last.close)) {
          store.markTriggered(a.id, Date.now());
          fired = a;
        }
      }
      if (fired) {
        playAlertSound();
        const dirText = fired.direction === 'above' ? strings.alertAbove : strings.alertBelow;
        setBanner({
          title: strings.alertBannerTitle,
          detail: `${fired.symbolLabel} ${dirText} ${fired.price}（现价 ${last.close}）`,
        });
        if (bannerTimerRef.current !== null) window.clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = window.setTimeout(() => setBanner(null), 10000);
      }
    };
    check();
    const timer = window.setInterval(check, 2000);
    return () => {
      window.clearInterval(timer);
      if (bannerTimerRef.current !== null) window.clearTimeout(bannerTimerRef.current);
    };
  }, [activePaneId, panes]);

  const addAlert = useCallback(
    (direction: AlertDirection, price: number) => {
      const store = alertStoreRef.current;
      if (!store || !activePane) return;
      store.add({
        id: createAlertId(),
        symbolId: activePane.symbolId,
        symbolLabel: activeSymbol.label,
        direction,
        price,
        createdAt: Date.now(),
        triggeredAt: null,
      });
    },
    [activePane, activeSymbol],
  );

  const removeAlert = useCallback((id: string) => {
    alertStoreRef.current?.remove(id);
  }, []);

  const activeAlertCount = alerts.filter((a) => a.triggeredAt === null).length;
  const activeCandles = paneDataRef.current.get(activePaneId) ?? [];
  const activeLastPrice =
    activeCandles.length > 0 ? activeCandles[activeCandles.length - 1].close : null;
  const activePrecision =
    activeLastPrice !== null ? precisionForPrice(activeLastPrice) : 4;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#131722] text-[#d1d4dc]">
      {/* 顶栏 */}
      <header className="flex items-center gap-2 h-12 px-3 border-b border-[#2a2e39] shrink-0">
        {/* 分屏切换 */}
        <span className="text-sm text-[#787b86]">{strings.paneCountLabel}</span>
        <div className="flex items-center gap-1">
          {PANE_COUNTS.map((c) => (
            <button
              key={c}
              onClick={() => changePaneCount(c)}
              className={`h-8 px-2.5 rounded text-sm ${
                c === paneCount
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#b2b5be] hover:bg-[#2a2e39]'
              }`}
            >
              {c}
              {strings.paneUnit}
            </button>
          ))}
        </div>

        {/* 十字光标同步开关 */}
        <button
          onClick={() => setCrosshairSync((v) => !v)}
          title={strings.crosshairSync}
          className={`h-8 px-3 rounded text-sm border ${
            crosshairSync
              ? 'bg-[#2962ff] text-white border-[#2962ff]'
              : 'text-[#b2b5be] bg-[#1e222d] border-[#2a2e39] hover:bg-[#2a2e39]'
          }`}
        >
          {strings.crosshairSync}
        </button>

        {/* 命名布局 */}
        <LayoutMenu
          layouts={layouts}
          onSave={saveLayout}
          onLoad={loadLayout}
          onRename={renameLayout}
          onDelete={deleteLayout}
        />

        <div className="flex-1" />

        {/* 指标 / Pine 编辑器（M3 阶段 B） */}
        <button
          onClick={() => setPineOpen((v) => !v)}
          title={strings.pineTitle}
          className={`h-8 px-3 rounded text-sm border ${
            pineOpen
              ? 'bg-[#2962ff] text-white border-[#2962ff]'
              : 'text-[#b2b5be] bg-[#1e222d] border-[#2a2e39] hover:bg-[#2a2e39]'
          }`}
        >
          {strings.indicators}
        </button>

        {/* 刷选回测区间（浮层优化） */}
        <button
          onClick={() => setBrushMode((v) => !v)}
          title={strings.brushHint}
          className={`h-8 px-3 rounded text-sm border ${
            brushMode
              ? 'bg-[#2962ff] text-white border-[#2962ff]'
              : 'text-[#b2b5be] bg-[#1e222d] border-[#2a2e39] hover:bg-[#2a2e39]'
          }`}
        >
          {strings.brushMode}
        </button>

        {/* 预警（M3 阶段 C） */}
        <button
          onClick={() => setAlertOpen((v) => !v)}
          title={strings.alertTitle}
          className={`relative h-8 px-3 rounded text-sm border ${
            alertOpen
              ? 'bg-[#2962ff] text-white border-[#2962ff]'
              : 'text-[#b2b5be] bg-[#1e222d] border-[#2a2e39] hover:bg-[#2a2e39]'
          }`}
        >
          {strings.alerts}
          {activeAlertCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 flex items-center justify-center rounded-full text-[11px] bg-[#f0b90b] text-black">
              {activeAlertCount}
            </span>
          )}
        </button>

        {/* 模拟交易（M3 阶段 C） */}
        <button
          onClick={() => setTradeOpen((v) => !v)}
          title={strings.tradeTitle}
          className={`h-8 px-3 rounded text-sm border ${
            tradeOpen
              ? 'bg-[#2962ff] text-white border-[#2962ff]'
              : 'text-[#b2b5be] bg-[#1e222d] border-[#2a2e39] hover:bg-[#2a2e39]'
          }`}
        >
          {strings.trade}
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 左侧工具栏：画线工具（M2），作用于活动窗格 */}
        <aside className="flex flex-col items-center gap-1 w-12 py-2 border-r border-[#2a2e39] shrink-0">
          {TOOL_ICONS.map((t) => (
            <button
              key={t.key}
              title={t.title}
              onClick={() => setActiveTool((cur) => (cur === t.key ? 'select' : t.key))}
              className={`w-9 h-9 flex items-center justify-center rounded ${
                activeTool === t.key
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#b2b5be]'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {t.svg}
              </svg>
            </button>
          ))}
        </aside>

        {/* 多图网格 */}
        <main className="flex flex-1 min-w-0 min-h-0">
          <ChartGrid
            panes={panes}
            paneCount={paneCount}
            activePaneId={activePaneId}
            activeTool={activeTool}
            crosshairSync={crosshairSync}
            onActivatePane={setActivePaneId}
            onPaneChange={changePane}
            pineOverlays={pineOverlays}
            onPaneData={handlePaneData}
            eventLines={eventLines}
            brushMode={brushMode}
            onBrushRange={handleBrushRange}
          />
        </main>
      </div>

      {/* Pine 编辑器面板（M3 阶段 B） */}
      {pineOpen && activePane && (
        <PinePanel
          candles={paneDataRef.current.get(activePaneId) ?? []}
          symbolId={activePane.symbolId}
          timeframe={activePane.timeframe}
          symbolLabel={activeSymbol.label}
          onOverlaysChange={setPineOverlays}
          onClose={() => setPineOpen(false)}
          brushRange={brushRange}
          onClearBrushRange={() => setBrushRange(null)}
        />
      )}

      {/* 预警触发横幅（M3 阶段 C） */}
      {banner && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 pl-4 pr-2 h-11 rounded-md border border-[#f0b90b] bg-[#2a2118] shadow-2xl">
          <span className="text-sm">⚠️</span>
          <span className="text-sm font-medium text-[#f0b90b]">{banner.title}</span>
          <span className="text-sm text-[#d1d4dc]">{banner.detail}</span>
          <button
            onClick={() => setBanner(null)}
            className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
          >
            ✕
          </button>
        </div>
      )}

      {/* 预警面板（M3 阶段 C） */}
      {alertOpen && activePane && (
        <AlertPanel
          alerts={alerts}
          currentPrice={activeLastPrice}
          symbolLabel={activeSymbol.label}
          symbolId={activePane.symbolId}
          precision={activePrecision}
          onAdd={addAlert}
          onRemove={removeAlert}
          onClose={() => setAlertOpen(false)}
        />
      )}

      {/* 浮动模拟交易窗（M3 阶段 C） */}
      {tradeOpen && (
        <TradePanel
          symbolLabel={activeSymbol.label}
          price={activeLastPrice}
          precision={activePrecision}
          onClose={() => setTradeOpen(false)}
        />
      )}

      {/* Footer：图表库署名 + 活动窗格 */}
      <footer className="flex items-center justify-between h-8 px-3 text-xs text-[#787b86] border-t border-[#2a2e39] shrink-0">
        <span>Charting by TradingView Lightweight Charts™ (Apache-2.0)</span>
        <span>
          {activeSymbol.label} {activePane?.timeframe}
        </span>
      </footer>
    </div>
  );
}
