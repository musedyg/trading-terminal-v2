// 新浪 A 股 K 线适配器（cn 主源）
// 逻辑从用户已验证的 trading-terminal-standalone/server/actions-core.mjs (loadChina) 移植
import type { Candle, KlineAdapter, Timeframe } from './types';
import { aggregate, chinaTimeToUtcSeconds, cleanBars } from './utils';

// 4h 用 60m 拉回后聚合 14400s；日线 scale=240
const SCALE: Record<Timeframe, number> = {
  '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 60, '1d': 240,
};

interface SinaRow {
  day?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

interface SinaResponse {
  result?: {
    status?: { code?: number };
    data?: SinaRow[];
  };
}

async function fetchSina(feed: string, timeframe: Timeframe, limit = 240): Promise<Candle[]> {
  const scale = SCALE[timeframe];
  const url = `https://quotes.sina.cn/cn/api/openapi.php/CN_MarketDataService.getKLineData?symbol=${encodeURIComponent(feed)}&scale=${scale}&ma=no&datalen=${Math.min(limit, 1000)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`新浪财经返回 ${res.status}`);
  const json = (await res.json()) as SinaResponse;
  if (json.result?.status?.code !== 0) throw new Error('新浪行情返回异常');
  // 注意：新浪日 K 的 day 字段是纯日期串（如 "2026-10-08"，无时间部分），
  // chinaTimeToUtcSeconds 已兼容（视为当天 00:00 CST）。
  const rows: Candle[] = (json.result?.data ?? []).map((x) => ({
    time: chinaTimeToUtcSeconds(String(x.day ?? '')),
    open: Number(x.open),
    high: Number(x.high),
    low: Number(x.low),
    close: Number(x.close),
    volume: Number(x.volume),
  }));
  const out = timeframe === '4h' ? aggregate(rows, 14400) : cleanBars(rows);
  return out.slice(-limit);
}

export const sinaAdapter: KlineAdapter = {
  name: 'sina',
  label: '新浪财经',
  markets: ['cn'],
  timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
  fetchKlines: fetchSina,
};
