// OKX K 线适配器（crypto 备源）
// 逻辑从用户已验证的 trading-terminal-standalone/server/actions-core.mjs (loadOkx) 移植
import type { Candle, KlineAdapter, Timeframe } from './types';
import { cleanBars } from './utils';

const BAR: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D',
};

interface OkxResponse {
  code?: string;
  msg?: string;
  data?: string[][];
}

async function fetchOkx(feed: string, timeframe: Timeframe, limit = 240): Promise<Candle[]> {
  const bar = BAR[timeframe];
  const url = `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(feed)}&bar=${bar}&limit=${Math.min(limit, 300)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`OKX 返回 ${res.status}`);
  const json = (await res.json()) as OkxResponse;
  if (json.code !== '0') throw new Error(json.msg || 'OKX 返回异常');
  const rows: Candle[] = (json.data ?? []).map((r) => ({
    time: Math.floor(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
  return cleanBars(rows).slice(-limit);
}

export const okxAdapter: KlineAdapter = {
  name: 'okx',
  label: 'OKX',
  markets: ['crypto'],
  timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
  fetchKlines: fetchOkx,
};
