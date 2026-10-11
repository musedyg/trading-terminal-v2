'use client';

// Pine 编辑器面板（M3 阶段 B）：底部抽屉。
// 代码输入 → PineTS 运行（v5/v6 粘贴即跑）→ 绘图输出叠加到活动窗格图表；
// strategy 脚本额外展示回测汇总（收益/回撤/胜率/交易次数 + 收益曲线）。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UTCTimestamp } from 'lightweight-charts';
import { PineTSEngine, pineSourceKey } from '@/lib/pine/pinets-engine';
import type { PineBacktest, PinePlot } from '@/lib/pine/engine';
import type { PineOverlay } from '@/components/chart/PriceChart';
import type { Candle } from '@/lib/data/types';
import { strings } from '@/lib/i18n';

const SAMPLE_INDICATOR = `//@version=5
indicator('均线示例', overlay=true)
// 在下方粘贴 TradingView 社区 Pine v5/v6 脚本，点运行即可
len = input.int(20, '均线长度')
s = ta.sma(close, len)
plot(s, 'SMA', color=color.blue)
`;

const SAMPLE_STRATEGY = `//@version=5
strategy('双均线策略示例', overlay=true, initial_capital=10000)
fast = ta.sma(close, 10)
slow = ta.sma(close, 30)
if ta.crossover(fast, slow)
    strategy.entry('做多', strategy.long)
if ta.crossunder(fast, slow)
    strategy.close('做多')
plot(fast, '快线', color=color.blue)
plot(slow, '慢线', color=color.orange)
`;

interface PlotRow extends PinePlot {
  visible: boolean;
}

export interface PinePanelProps {
  candles: Candle[];
  symbolId: string;
  timeframe: string;
  symbolLabel: string;
  onOverlaysChange: (overlays: PineOverlay[]) => void;
  onClose: () => void;
}

function loadSource(symbolId: string): string {
  try {
    if (typeof localStorage === 'undefined') return SAMPLE_INDICATOR;
    return localStorage.getItem(pineSourceKey(symbolId)) ?? SAMPLE_INDICATOR;
  } catch {
    return SAMPLE_INDICATOR;
  }
}

function buildOverlays(plots: PlotRow[]): PineOverlay[] {
  return plots
    .filter((p) => p.visible)
    .map((p, i) => ({
      id: `pine-plot-${i}-${p.name}`,
      color: p.color,
      separateScale: !p.overlay,
      data: p.points.map((pt) => ({ time: pt.time as UTCTimestamp, value: pt.value })),
    }));
}

const fmtMoney = (v: number) =>
  v.toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

export default function PinePanel({
  candles,
  symbolId,
  timeframe,
  symbolLabel,
  onOverlaysChange,
  onClose,
}: PinePanelProps) {
  const [source, setSource] = useState(() => loadSource(symbolId));
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [plots, setPlots] = useState<PlotRow[]>([]);
  const [backtest, setBacktest] = useState<PineBacktest | null>(null);
  const [isStrategy, setIsStrategy] = useState(false);
  const overlaysCbRef = useRef(onOverlaysChange);
  overlaysCbRef.current = onOverlaysChange;

  // 切换品种：读该品种保存的脚本，清空上次结果与图表叠加
  useEffect(() => {
    setSource(loadSource(symbolId));
    setErrors([]);
    setPlots([]);
    setBacktest(null);
    setIsStrategy(false);
    overlaysCbRef.current([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolId]);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setErrors([]);
    try {
      try {
        localStorage.setItem(pineSourceKey(symbolId), source);
      } catch {
        // 忽略持久化失败
      }
      const engine = new PineTSEngine();
      const res = await engine.run(source, candles, { timeframe, symbolId });
      setErrors(res.errors);
      const rows: PlotRow[] = res.plots.map((p) => ({ ...p, visible: true }));
      setPlots(rows);
      setBacktest(res.backtest ?? null);
      setIsStrategy(res.isStrategy);
      overlaysCbRef.current(buildOverlays(rows));
    } finally {
      setRunning(false);
    }
  }, [running, source, candles, timeframe, symbolId]);

  const togglePlot = useCallback(
    (name: string) => {
      setPlots((prev) => {
        const next = prev.map((p) => (p.name === name ? { ...p, visible: !p.visible } : p));
        overlaysCbRef.current(buildOverlays(next));
        return next;
      });
    },
    [],
  );

  const clearAll = useCallback(() => {
    setErrors([]);
    setPlots([]);
    setBacktest(null);
    setIsStrategy(false);
    overlaysCbRef.current([]);
  }, []);

  const profitColor = backtest && backtest.netProfit >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]';

  return (
    <div className="flex flex-col h-[340px] shrink-0 border-t border-[#2a2e39] bg-[#131722]">
      {/* 头部 */}
      <div className="flex items-center gap-2 h-10 px-3 border-b border-[#2a2e39] shrink-0">
        <span className="text-sm font-medium text-[#d1d4dc]">{strings.pineTitle}</span>
        <span className="text-xs text-[#787b86]">{strings.pineEngine}</span>
        <span className="text-xs text-[#787b86]">
          {symbolLabel} {timeframe}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setSource(SAMPLE_INDICATOR)}
          className="h-7 px-2.5 rounded text-xs text-[#b2b5be] bg-[#1e222d] border border-[#2a2e39] hover:bg-[#2a2e39]"
        >
          {strings.pineSampleIndicator}
        </button>
        <button
          onClick={() => setSource(SAMPLE_STRATEGY)}
          className="h-7 px-2.5 rounded text-xs text-[#b2b5be] bg-[#1e222d] border border-[#2a2e39] hover:bg-[#2a2e39]"
        >
          {strings.pineSampleStrategy}
        </button>
        <button
          onClick={clearAll}
          className="h-7 px-2.5 rounded text-xs text-[#b2b5be] bg-[#1e222d] border border-[#2a2e39] hover:bg-[#2a2e39]"
        >
          {strings.pineClear}
        </button>
        <button
          onClick={run}
          disabled={running}
          className="h-7 px-4 rounded text-xs bg-[#2962ff] text-white hover:bg-[#1e53e5] disabled:opacity-50"
        >
          {running ? strings.pineRunning : strings.pineRun}
        </button>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
        >
          ✕
        </button>
      </div>

      {/* 主体 */}
      <div className="flex flex-1 min-h-0">
        {/* 编辑器 */}
        <div className="w-[55%] min-w-0 border-r border-[#2a2e39] flex flex-col">
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            placeholder={strings.pineHint}
            className="flex-1 w-full h-full p-3 bg-[#0e1016] text-[#d1d4dc] font-mono text-xs leading-5 outline-none resize-none placeholder:text-[#4a4e5a]"
          />
        </div>

        {/* 结果区 */}
        <div className="flex-1 min-w-0 overflow-y-auto p-3 flex flex-col gap-3">
          {errors.length > 0 && (
            <div className="rounded border border-[#ef5350]/40 bg-[#ef5350]/10 p-2.5">
              <div className="text-xs font-medium text-[#ef5350] mb-1">{strings.pineErrors}</div>
              {errors.map((e, i) => (
                <div key={i} className="text-xs text-[#f0a0a0] leading-5">
                  {e}
                </div>
              ))}
            </div>
          )}

          {plots.length > 0 && (
            <div>
              <div className="text-xs font-medium text-[#b2b5be] mb-1.5">{strings.pinePlots}</div>
              <div className="flex flex-col gap-1">
                {plots.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => togglePlot(p.name)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#1e222d] border border-[#2a2e39] hover:border-[#2962ff] text-left"
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: p.color, opacity: p.visible ? 1 : 0.25 }}
                    />
                    <span className="flex-1 text-xs text-[#d1d4dc] truncate">{p.name}</span>
                    <span className="text-[11px] text-[#787b86]">
                      {p.overlay ? strings.pineOverlayMain : strings.pineOverlaySeparate}
                    </span>
                    <span className="text-[11px] text-[#787b86]">
                      {p.visible ? strings.pineHide : strings.pineShow}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isStrategy && backtest && (
            <div>
              <div className="text-xs font-medium text-[#b2b5be] mb-1.5">{strings.pineBacktest}</div>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                <Metric label={strings.pineNetProfit} value={fmtMoney(backtest.netProfit)} className={profitColor} />
                <Metric label={strings.pineTotalReturn} value={fmtPct(backtest.totalReturnPct)} className={profitColor} />
                <Metric label={strings.pineTradeCount} value={String(backtest.tradeCount)} />
                <Metric label={strings.pineWinRate} value={`${backtest.winRate.toFixed(1)}%`} />
                <Metric label={strings.pineMaxDrawdown} value={fmtMoney(backtest.maxDrawdown)} className="text-[#f0b90b]" />
                <Metric label={strings.pineMaxDrawdownPct} value={`${backtest.maxDrawdownPct.toFixed(2)}%`} className="text-[#f0b90b]" />
              </div>
              <div className="text-[11px] text-[#787b86] mb-1">{strings.pineEquity}</div>
              <EquityCurve curve={backtest.equityCurve} />
            </div>
          )}

          {errors.length === 0 && plots.length === 0 && !backtest && (
            <div className="text-xs text-[#787b86] leading-5">{strings.pineHint}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded bg-[#1e222d] border border-[#2a2e39] px-2 py-1.5">
      <div className="text-[11px] text-[#787b86]">{label}</div>
      <div className={`text-sm font-medium text-[#d1d4dc] ${className}`}>{value}</div>
    </div>
  );
}

/** 收益曲线 SVG（无第三方依赖） */
function EquityCurve({ curve }: { curve: { time: number; equity: number }[] }) {
  const W = 320;
  const H = 110;
  const PAD = 6;
  if (curve.length < 2) return null;
  const vals = curve.map((p) => p.equity);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = curve.map((p, i) => {
    const x = PAD + (i / (curve.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((p.equity - min) / span) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = vals[vals.length - 1] >= vals[0];
  const line = up ? '#26a69a' : '#ef5350';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-[#1e222d] border border-[#2a2e39]">
      <polyline points={pts.join(' ')} fill="none" stroke={line} strokeWidth="1.5" />
      <polygon points={`${PAD},${H - PAD} ${pts.join(' ')} ${W - PAD},${H - PAD}`} fill={line} opacity="0.12" />
    </svg>
  );
}
