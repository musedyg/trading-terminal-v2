// 品种表（契约 CONTRACTS.md §2）
// 每个品种带各数据源的 feed 映射；failover 按注册顺序尝试有 feed 的源。
import type { DataSource } from './data/types';

export type Market = 'crypto' | 'cn' | 'us';

export interface SymbolInfo {
  id: string;
  label: string;
  market: Market;
  currency: string;
  /** 各数据源的 feed；缺哪个源就 failover 时跳过 */
  feeds: Partial<Record<DataSource, string>>;
}

export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const SYMBOLS: SymbolInfo[] = [
  {
    id: 'BTC/USD', label: 'BTC/USD', market: 'crypto', currency: 'USD',
    feeds: { binance: 'BTCUSDT', kraken: 'XBTUSD', okx: 'BTC-USDT-SWAP' },
  },
  {
    id: 'ETH/USD', label: 'ETH/USD', market: 'crypto', currency: 'USD',
    feeds: { binance: 'ETHUSDT', kraken: 'ETHUSD', okx: 'ETH-USDT-SWAP' },
  },
  {
    id: 'BTC-PERP', label: 'BTC 永续', market: 'crypto', currency: 'USDT',
    feeds: { okx: 'BTC-USDT-SWAP' }, // 仅 OKX 有永续，单源（无 failover）
  },
  {
    id: '600519', label: '贵州茅台 600519', market: 'cn', currency: 'CNY',
    feeds: { sina: 'sh600519', tencent: 'sh600519', eastmoney: '1.600519' },
  },
  {
    id: '000001', label: '上证指数 000001', market: 'cn', currency: 'CNY',
    feeds: { sina: 'sh000001', tencent: 'sh000001', eastmoney: '1.000001' },
  },
  {
    id: 'AAPL', label: 'AAPL 苹果', market: 'us', currency: 'USD',
    feeds: { yahoo: 'AAPL', yahoo2: 'AAPL' },
  },
  {
    id: 'NVDA', label: 'NVDA 英伟达', market: 'us', currency: 'USD',
    feeds: { yahoo: 'NVDA', yahoo2: 'NVDA' },
  },
];

/** 数据源中文展示名（footer / 状态栏用） */
export const SOURCE_LABELS: Record<DataSource, string> = {
  binance: 'Binance',
  kraken: 'Kraken',
  okx: 'OKX',
  sina: '新浪财经',
  tencent: '腾讯行情',
  eastmoney: '东方财富',
  yahoo: 'Yahoo Finance',
  yahoo2: 'Yahoo Finance（备用节点）',
};
