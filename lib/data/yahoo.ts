// Yahoo 美股 K 线适配器（us 主源）
// 逻辑从用户已验证的 trading-terminal-standalone/server/us.mjs (fetchYahooBars) 移植
import type { Candle, KlineAdapter, Timeframe } from './types';
import { aggregate, cleanBars } from './utils';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// ---- Yahoo 限频：请求间隔 ≥1.1s，全局串行排队（yahoo2 共用同一节流器） ----
const MIN_GAP_MS = 1100;
let yahooQueue: Promise<void> = Promise.resolve();
let yahooLastStart = 0;

export function throttleYahoo(): Promise<void> {
  const task = yahooQueue.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - yahooLastStart);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    yahooLastStart = Date.now();
  });
  yahooQueue = task.catch(() => undefined);
  return task;
}

// 4h 取 1h 数据后聚合 14400s
const TF_MAP: Record<Timeframe, { interval: string; range: string; aggregate?: number }> = {
  '1m': { interval: '1m', range: '1d' },
  '5m': { interval: '5m', range: '5d' },
  '15m': { interval: '15m', range: '1mo' },
  '1h': { interval: '1h', range: '3mo' },
  '4h': { interval: '1h', range: '3mo', aggregate: 14400 },
  '1d': { interval: '1d', range: '1y' },
};

interface YahooQuote {
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
  volume?: (number | null)[];
}

interface YahooChartResult {
  timestamp?: number[];
  indicators?: { quote?: YahooQuote[] };
}

interface YahooResponse {
  chart?: {
    result?: YahooChartResult[];
    error?: { description?: string };
  };
}

/** 供 yahoo / yahoo2 共用的抓取实现（host 不同） */
export async function fetchYahooHostKlines(
  host: string,
  feed: string,
  timeframe: Timeframe,
  limit = 240,
): Promise<Candle[]> {
  const m = TF_MAP[timeframe];
  await throttleYahoo();
  const url = `${host}/v8/finance/chart/${encodeURIComponent(feed)}?interval=${m.interval}&range=${m.range}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Yahoo 返回 ${res.status}`);
  const json = (await res.json()) as YahooResponse;
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo 无数据(${feed}): ${json?.chart?.error?.description ?? '未知错误'}`);
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const bars: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (![t, o, h, l, c].every(Number.isFinite)) continue;
    bars.push({ time: t, open: o as number, high: h as number, low: l as number, close: c as number, volume: Number.isFinite(v) ? (v as number) : 0 });
  }
  if (!bars.length) throw new Error('Yahoo 暂未返回 K 线');
  const out = m.aggregate ? aggregate(bars, m.aggregate) : cleanBars(bars);
  return out.slice(-limit);
}

export const yahooAdapter: KlineAdapter = {
  name: 'yahoo',
  label: 'Yahoo Finance',
  markets: ['us'],
  timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
  fetchKlines: (feed, timeframe, limit) =>
    fetchYahooHostKlines('https://query1.finance.yahoo.com', feed, timeframe, limit),
};
