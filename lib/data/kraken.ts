// Kraken OHLC 适配器（crypto 备源）
// 逻辑从用户已验证的 trading-terminal-standalone/server/actions-core.mjs (loadKraken) 移植
import type { Candle, KlineAdapter, Timeframe } from './types';
import { cleanBars } from './utils';

const INTERVAL: Record<Timeframe, number> = {
  '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
};

interface KrakenResponse {
  error?: string[];
  result?: Record<string, (string | number)[][]>;
}

async function fetchKraken(feed: string, timeframe: Timeframe, limit = 240): Promise<Candle[]> {
  const interval = INTERVAL[timeframe];
  const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(feed)}&interval=${interval}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Kraken 返回 ${res.status}`);
  const json = (await res.json()) as KrakenResponse;
  if (json.error?.length) throw new Error(json.error.join('; '));
  const key = Object.keys(json.result ?? {}).find((item) => item !== 'last');
  const raw = key ? json.result?.[key] : [];
  const rows: Candle[] = (Array.isArray(raw) ? raw : []).map((r) => ({
    time: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[6]),
  }));
  return cleanBars(rows).slice(-limit);
}

export const krakenAdapter: KlineAdapter = {
  name: 'kraken',
  label: 'Kraken',
  markets: ['crypto'],
  timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
  fetchKlines: fetchKraken,
};
