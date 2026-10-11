// 数据层共享工具（无依赖，被 adapters 与 index.ts 共同引用，避免模块循环）
// 逻辑从用户已验证的 trading-terminal-standalone/server/actions-core.mjs 移植
import type { Candle } from './types';

/** 解析新浪 day 字段：兼容 "2026-10-08"（纯日期串，视为当天 00:00 CST）
 *  与 "2026-10-08 10:30:00"（CST 时间），返回 UTC unix 秒。 */
export function chinaTimeToUtcSeconds(value: string): number {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return 0;
  const year = Number(m[1]); const month = Number(m[2]); const day = Number(m[3]);
  const hour = Number(m[4] ?? 0); const minute = Number(m[5] ?? 0); const second = Number(m[6] ?? 0);
  return Math.floor((Date.UTC(year, month - 1, day, hour, minute, second) - 8 * 3600_000) / 1000);
}

/** 清洗：过滤非 finite 与 <=0 的行，按 floor(time) 去重，按 time 升序，只保留最近 240 根 */
export function cleanBars(rows: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const row of rows) {
    if (![row.time, row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite)) continue;
    if (!(row.time > 0 && row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0)) continue;
    const t = Math.floor(row.time);
    byTime.set(t, { ...row, time: t, volume: Math.max(0, row.volume) });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-240);
}

/** 按秒聚合 OHLCV（bucket 起点对齐到 UTC 秒） */
export function aggregate(rows: Candle[], seconds: number): Candle[] {
  if (seconds <= 60) return cleanBars(rows);
  const groups = new Map<number, Candle>();
  for (const row of cleanBars(rows)) {
    const key = Math.floor(row.time / seconds) * seconds;
    const old = groups.get(key);
    if (!old) groups.set(key, { ...row, time: key });
    else groups.set(key, { time: key, open: old.open, high: Math.max(old.high, row.high), low: Math.min(old.low, row.low), close: row.close, volume: old.volume + row.volume });
  }
  return [...groups.values()].sort((a, b) => a.time - b.time).slice(-240);
}
