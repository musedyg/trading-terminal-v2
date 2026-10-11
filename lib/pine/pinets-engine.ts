// PineTS 引擎适配器（M3 阶段 B）：把社区 Pine v5/v6 脚本跑在自研 K 线上。
// PineTS 为 AGPL-3.0，动态 import，失败时降级为中文错误提示。
import type { Candle } from '@/lib/data/types';
import type {
  PineBacktest,
  PineEngine,
  PinePlot,
  PineResult,
  PineRunOptions,
} from './engine.ts';

const SOURCE_PREFIX = 'ttv2.pine.v1';

/** 用户脚本持久化键（按品种） */
export function pineSourceKey(symbolId: string): string {
  return `${SOURCE_PREFIX}::${symbolId}`;
}

/** Candle（unix 秒）→ PineTS Kline（毫秒） */
export function toKlines(candles: Candle[]): Record<string, number>[] {
  const bars = candles.filter((c) =>
    [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v)),
  );
  let step = 86400;
  if (bars.length > 1) {
    const diffs: number[] = [];
    for (let i = 1; i < bars.length; i++) diffs.push(bars[i].time - bars[i - 1].time);
    diffs.sort((a, b) => a - b);
    const med = diffs[Math.floor(diffs.length / 2)];
    if (Number.isFinite(med) && med > 0) step = med;
  }
  return bars.map((c) => ({
    openTime: c.time * 1000,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: Number.isFinite(c.volume) ? c.volume : 0,
    closeTime: c.time * 1000 + step * 1000 - 1,
    quoteAssetVolume: 0,
    numberOfTrades: 0,
    takerBuyBaseAssetVolume: 0,
    takerBuyQuoteAssetVolume: 0,
    ignore: 0,
  }));
}

interface RawTrade {
  exit_time?: number;
  profit?: number;
}

/** 从 PineTS strategy 状态重建回测汇总（纯函数，可单测） */
export function computeBacktest(
  strategy: {
    closedtrades?: RawTrade[];
    config?: { initial_capital?: number };
    netprofit?: number;
  } | null | undefined,
  candles: Candle[],
): PineBacktest | undefined {
  if (!strategy || !Array.isArray(strategy.closedtrades)) return undefined;
  const initial = Number(strategy.config?.initial_capital) || 0;
  const trades = strategy.closedtrades
    .filter((t) => Number.isFinite(t.exit_time) && Number.isFinite(t.profit))
    .sort((a, b) => (a.exit_time as number) - (b.exit_time as number));

  const equityCurve: PineBacktest['equityCurve'] = [];
  const startTime = candles.length > 0 ? candles[0].time : 0;
  let equity = initial;
  equityCurve.push({ time: startTime, equity });
  for (const t of trades) {
    equity += t.profit as number;
    equityCurve.push({ time: Math.floor((t.exit_time as number) / 1000), equity });
  }

  const netProfit = Number.isFinite(strategy.netprofit)
    ? (strategy.netprofit as number)
    : equity - initial;
  const wins = trades.filter((t) => (t.profit as number) > 0).length;

  // 最大回撤：收益曲线峰值→谷值
  let peak = equityCurve.length > 0 ? equityCurve[0].equity : initial;
  let maxDd = 0;
  let maxDdPct = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak - p.equity;
    if (dd > maxDd) maxDd = dd;
    if (peak > 0 && dd / peak > maxDdPct) maxDdPct = dd / peak;
  }

  return {
    initialCapital: initial,
    netProfit,
    totalReturnPct: initial > 0 ? (netProfit / initial) * 100 : 0,
    maxDrawdown: maxDd,
    maxDrawdownPct: maxDdPct * 100,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    tradeCount: trades.length,
    equityCurve,
  };
}

/** 把 PineTS 抛出的英文错误转成中文提示（首行 + 常见映射） */
export function toChineseError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const first = raw.split('\n')[0].slice(0, 300);
  let zh = first;
  if (/version\s*=\s*4\b/i.test(raw)) {
    return 'PineTS 仅支持 Pine v5/v6，不支持 v4。请把脚本升级到 v5/v6 后再运行。';
  }
  const maps: [RegExp, string][] = [
    [/Unexpected token/i, '语法错误：'],
    [/is not defined/i, '未定义的变量或函数：'],
    [/Cannot read propert/i, '运行时错误：'],
    [/timeout|timed out/i, '运行超时：'],
    [/maximum.*loop|too many/i, '循环次数超限：'],
  ];
  for (const [re, prefix] of maps) {
    if (re.test(first)) {
      zh = prefix + first;
      break;
    }
  }
  return `Pine 运行出错：${zh}`;
}

/** 识别脚本类型 */
export function detectScriptKind(source: string): 'strategy' | 'indicator' | 'unknown' {
  if (/^\s*strategy\s*\(/m.test(source)) return 'strategy';
  if (/^\s*indicator\s*\(/m.test(source)) return 'indicator';
  return 'unknown';
}

export class PineTSEngine implements PineEngine {
  readonly name = 'pinets';

  async run(source: string, candles: Candle[], opts?: PineRunOptions): Promise<PineResult> {
    const errors: string[] = [];
    if (!source.trim()) {
      return { plots: [], errors: ['请先在编辑器中粘贴或编写 Pine 脚本'], isStrategy: false };
    }
    if (candles.length === 0) {
      return { plots: [], errors: ['当前窗格暂无 K 线数据，无法运行'], isStrategy: false };
    }
    if (/^\s*\/\/@version=4\b/m.test(source)) {
      return {
        plots: [],
        errors: ['PineTS 仅支持 Pine v5/v6，不支持 v4。请把脚本升级到 v5/v6 后再运行。'],
        isStrategy: false,
      };
    }

    let pinets: typeof import('pinets');
    try {
      pinets = await import('pinets');
    } catch (e) {
      return { plots: [], errors: [`PineTS 加载失败：${toChineseError(e)}`], isStrategy: false };
    }

    const klines = toKlines(candles);
    if (klines.length === 0) {
      return { plots: [], errors: ['K 线数据无效，无法运行'], isStrategy: false };
    }

    const kind = detectScriptKind(source);
    try {
      const pine = new pinets.PineTS(klines, opts?.symbolId ?? 'SYM', opts?.timeframe ?? '1d');
      const ctx = await pine.run(source);

      const plots: PinePlot[] = [];
      const rawPlots = (ctx.plots ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(rawPlots)) {
        if (key.startsWith('__')) continue; // 跳过内部绘图（线/框/表）
        const entry = rawPlots[key] as {
          data?: { time?: number; value?: number | null }[];
          options?: { color?: string; overlay?: boolean };
          title?: string;
        };
        if (!Array.isArray(entry.data)) continue;
        const points = entry.data
          .filter((d) => typeof d.time === 'number')
          .map((d) => ({
            time: Math.floor((d.time as number) / 1000),
            value: typeof d.value === 'number' && Number.isFinite(d.value) ? d.value : null,
          }));
        if (points.length === 0) continue;
        plots.push({
          name: typeof entry.title === 'string' && entry.title ? entry.title : key,
          color:
            typeof entry.options?.color === 'string' && entry.options.color
              ? entry.options.color
              : '#2962ff',
          overlay: entry.options?.overlay !== false,
          points,
        });
      }

      const isStrategy = kind === 'strategy' || Boolean(ctx.strategy);
      let backtest: PineBacktest | undefined;
      if (isStrategy && ctx.strategy) {
        backtest = computeBacktest(
          ctx.strategy as {
            closedtrades?: RawTrade[];
            config?: { initial_capital?: number };
            netprofit?: number;
          },
          candles,
        );
      }
      if (plots.length === 0 && !backtest) {
        errors.push('运行成功，但没有产生任何绘图输出（检查 plot() 调用）');
      }
      return { plots, errors, isStrategy, backtest };
    } catch (e) {
      return { plots: [], errors: [toChineseError(e)], isStrategy: kind === 'strategy' };
    }
  }
}
