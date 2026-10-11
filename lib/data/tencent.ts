// 腾讯 A 股 K 线适配器（cn 主源第二顺位）
// 接口：web.ifzq.gtimg.cn/appstock/app/day/query?code=sh600519
// 返回每日的分时 tick（"0930 价格 累计成交量 累计成交额"），本适配器聚成分钟 K 线后再聚合到目标周期。
import type { Candle, KlineAdapter, Timeframe } from './types';
import { aggregate, chinaTimeToUtcSeconds, cleanBars } from './utils';

const SECONDS: Record<Timeframe, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

interface TencentDay {
  date?: string; // "20261009"
  data?: string[]; // ["0930 1255.42 195 24480690.00", ...]（价格 累计成交量(股) 累计成交额）
}

interface TencentResponse {
  code?: number;
  msg?: string;
  data?: Record<string, { data?: TencentDay[] }>;
}

async function fetchTencent(feed: string, timeframe: Timeframe, limit = 240): Promise<Candle[]> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/day/query?code=${encodeURIComponent(feed)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`腾讯行情返回 ${res.status}`);
  const json = (await res.json()) as TencentResponse;
  if (json.code !== 0) throw new Error(json.msg || '腾讯行情返回异常');
  const days = json.data?.[feed]?.data ?? [];
  const minutes: Candle[] = [];
  for (const day of days) {
    const d = String(day.date ?? '');
    if (!/^\d{8}$/.test(d)) continue;
    const ymd = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    let prevCumVol = 0;
    for (const line of day.data ?? []) {
      const parts = line.trim().split(/\s+/);
      const hm = parts[0] ?? '';
      const price = Number(parts[1]);
      const cumVol = Number(parts[2]);
      if (!/^\d{4}$/.test(hm) || !Number.isFinite(price)) continue;
      const time = chinaTimeToUtcSeconds(`${ymd} ${hm.slice(0, 2)}:${hm.slice(2, 4)}:00`);
      const volume = Number.isFinite(cumVol) ? Math.max(0, cumVol - prevCumVol) : 0;
      if (Number.isFinite(cumVol)) prevCumVol = cumVol;
      minutes.push({ time, open: price, high: price, low: price, close: price, volume });
    }
  }
  if (!minutes.length) throw new Error('腾讯暂未返回 K 线');
  return aggregate(minutes, SECONDS[timeframe]).slice(-limit);
}

export const tencentAdapter: KlineAdapter = {
  name: 'tencent',
  label: '腾讯行情',
  markets: ['cn'],
  timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
  fetchKlines: fetchTencent,
};
