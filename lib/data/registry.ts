// 数据源注册表：一主一备自动 failover — 来源：CONTRACTS.md
// 新增数据源：在 lib/data/ 下新建适配器文件（实现 KlineAdapter），
// 然后在 lib/data/adapters.ts 里 registerAdapter 一行即可，不动核心逻辑。
import type { Market, SymbolInfo } from '../symbols';
import type { Candle, DataSource, KlineAdapter, Timeframe } from './types';

/** 每个市场一个有序适配器列表：排在前面 = 优先级高（主源在前，备源在后） */
const registry = new Map<Market, KlineAdapter[]>();

/**
 * 注册适配器。`primary: true` 时插到队首（主源），否则追加到队尾（备源）。
 * 同一市场内 name 重复会抛错。
 */
export function registerAdapter(market: Market, adapter: KlineAdapter, opts?: { primary?: boolean }): void {
  const list = registry.get(market) ?? [];
  if (list.some((a) => a.name === adapter.name)) {
    throw new Error(`数据源 ${adapter.name} 已在 ${market} 注册`);
  }
  if (opts?.primary) list.unshift(adapter);
  else list.push(adapter);
  registry.set(market, list);
}

/** 取某市场的适配器（按优先级排序，主源在前）。返回副本。 */
export function getAdapters(market: Market): KlineAdapter[] {
  return [...(registry.get(market) ?? [])];
}

export interface FailoverResult {
  candles: Candle[];
  /** 实际出数据的源 */
  source: DataSource;
  /** 实际尝试过的源（按顺序） */
  tried: DataSource[];
}

/**
 * 一主一备拉取：按注册顺序依次尝试，跳过"该品种无 feed"或"不支持该周期"的适配器；
 * 主源失败自动切备用；全部失败时抛聚合错误。
 */
export async function fetchKlinesWithFailover(
  symbol: SymbolInfo,
  timeframe: Timeframe,
  limit = 240,
): Promise<FailoverResult> {
  const tried: DataSource[] = [];
  const errors: string[] = [];
  for (const adapter of getAdapters(symbol.market)) {
    const feed = symbol.feeds[adapter.name];
    if (!feed) continue; // 该品种在此源没有 feed
    if (!adapter.timeframes.includes(timeframe)) continue; // 该源不支持此周期
    tried.push(adapter.name);
    try {
      const candles = await adapter.fetchKlines(feed, timeframe, limit);
      if (!candles.length) throw new Error('返回空数据');
      return { candles, source: adapter.name, tried };
    } catch (e) {
      errors.push(`${adapter.label}(${adapter.name}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!tried.length) throw new Error(`品种 ${symbol.id} 在 ${timeframe} 周期下没有可用数据源`);
  throw new Error(`所有数据源均失败 [${tried.join(', ')}]：${errors.join('；')}`);
}
