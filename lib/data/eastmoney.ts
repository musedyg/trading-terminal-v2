// 东方财富 A 股 K 线适配器（cn 备源）
// 接口：push2his.eastmoney.com/api/qt/stock/kline/get（公开，无需 key）
// secid 格式："1.600519"（1=上证，0=深证）；klt: 1/5/15/30/60=分钟，101=日K
// 注意：返回的 volume 单位是"手"，已 ×100 换算成股，与新浪/腾讯口径一致。
import type { Candle, KlineAdapter, Timeframe } from './types';
import { aggregate, chinaTimeToUtcSeconds, cleanBars } from './utils';

const KLT: Record<Timeframe, number> = {
  '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 60, '1d': 101,
};

interface EastmoneyResponse {
  rc?: number;
  data?: {
    klines?: string[]; // "2026-10-09 10:30,开,收,高,低,量(手),额" 或日线 "2026-10-09,开,收,高,低,量(手),额"
  };
}

async function fetchEastmoney(feed: string, timeframe: Timeframe, limit = 240): Promise<Candle[]> {
  const klt = KLT[timeframe];
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(feed)}` +
    `&klt=${klt}&fqt=1&lmt=${Math.min(Math.max(limit, 10), 1000)}&end=20500101` +
    `&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`东方财富返回 ${res.status}`);
  const json = (await res.json()) as EastmoneyResponse;
  if (json.rc !== 0) throw new Error('东方财富返回异常');
  const rows: Candle[] = (json.data?.klines ?? []).map((line) => {
    const p = line.split(',');
    // 日期可能是 "2026-10-09"（日线）或 "2026-10-09 10:30"（分钟线）
    const day = `${p[0] ?? ''}${(p[0] ?? '').length <= 10 ? '' : ':00'}`;
    return {
      time: chinaTimeToUtcSeconds(day),
      open: Number(p[1]),
      high: Number(p[3]),
      low: Number(p[4]),
      close: Number(p[2]),
      volume: Number(p[5]) * 100, // 手 → 股
    };
  });
  if (!rows.length) throw new Error('东方财富暂未返回 K 线');
  const out = timeframe === '4h' ? aggregate(rows, 14400) : cleanBars(rows);
  return out.slice(-limit);
}

export const eastmoneyAdapter: KlineAdapter = {
  name: 'eastmoney',
  label: '东方财富',
  markets: ['cn'],
  timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
  fetchKlines: fetchEastmoney,
};
