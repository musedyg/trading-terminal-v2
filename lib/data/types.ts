// 数据层公共类型 — 来源：CONTRACTS.md
import type { TIMEFRAMES } from '../symbols';

/** 数据源标识 */
export type DataSource =
  | 'binance' | 'kraken' | 'okx'          // crypto
  | 'sina' | 'tencent' | 'eastmoney'       // cn
  | 'yahoo' | 'yahoo2';                     // us（yahoo2 = Yahoo 备用边缘节点）

/** 契约 timeframe（全小写），与 lib/symbols.ts 的 TIMEFRAMES 同源 */
export type Timeframe = (typeof TIMEFRAMES)[number];

/** 单根 K 线：time 为 unix 秒 */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * K 线适配器统一接口。
 * 新增数据源：新建一个文件实现本接口，然后在 lib/data/adapters.ts 里 registerAdapter 即可，
 * 不动核心逻辑。
 */
export interface KlineAdapter {
  /** 数据源标识（全局唯一） */
  readonly name: DataSource;
  /** 中文展示名，如 'Binance' / '新浪财经' */
  readonly label: string;
  /** 支持的市场 */
  readonly markets: readonly ('crypto' | 'cn' | 'us')[];
  /** 支持的周期（不支持的周期在 failover 时自动跳过） */
  readonly timeframes: readonly Timeframe[];
  /** 拉取 K 线，返回标准 OHLCV（time 为 unix 秒，升序） */
  fetchKlines(feed: string, timeframe: Timeframe, limit?: number): Promise<Candle[]>;
  // M3+ 可选：实时订阅（WS）。M1 仅 REST 轮询，暂不实现。
  // subscribe?(feed: string, timeframe: Timeframe, onCandle: (c: Candle) => void): () => void;
}
