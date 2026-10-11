// Binance K 线适配器（crypto 主源，品种最全）
// 注意：api.binance.com 在部分地区返回 451（地域限制），
// 这里使用官方公开行情专用域名 data-api.binance.vision（仅行情数据，无地域限制）。
// M1 仅 REST；WS 实时订阅可在 M3+ 通过 KlineAdapter.subscribe 扩展。
import type { Candle, KlineAdapter, Timeframe } from './types';
import { cleanBars } from './utils';

const HOST = 'https://data-api.binance.vision';
const INTERVAL: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d',
};

type BinanceRow = [number, string, string, string, string, string, number, string, number, string, string, string];

async function fetchBinance(feed: string, timeframe: Timeframe, limit = 240): Promise<Candle[]> {
  const interval = INTERVAL[timeframe];
  const url = `${HOST}/api/v3/klines?symbol=${encodeURIComponent(feed)}&interval=${interval}&limit=${Math.min(Math.max(limit, 10), 1000)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Binance 返回 ${res.status}`);
  const json = (await res.json()) as BinanceRow[];
  if (!Array.isArray(json)) throw new Error('Binance 返回格式异常');
  const rows: Candle[] = json.map((r) => ({
    time: Math.floor(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
  return cleanBars(rows).slice(-limit);
}

export const binanceAdapter: KlineAdapter = {
  name: 'binance',
  label: 'Binance',
  markets: ['crypto'],
  timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
  fetchKlines: fetchBinance,
};
