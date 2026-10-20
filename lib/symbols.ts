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
  // ---- 加密扩充（Binance 现货主源 + Kraken + OKX 永续备源，feed 规则与 BTC/ETH 一致）----
  ...(['SOL', 'DOGE', 'XRP', 'WLD', 'BNB', 'ADA', 'AVAX', 'LINK', 'LTC', 'SUI'] as const).map(
    (base): SymbolInfo => ({
      id: `${base}/USD`, label: `${base}/USD`, market: 'crypto', currency: 'USD',
      feeds: { binance: `${base}USDT`, kraken: `${base}USD`, okx: `${base}-USDT-SWAP` },
    }),
  ),
  // ---- A股扩充 ----
  {
    id: '399001', label: '深证成指 399001', market: 'cn', currency: 'CNY',
    feeds: { sina: 'sz399001', tencent: 'sz399001', eastmoney: '0.399001' },
  },
  {
    id: '399006', label: '创业板指 399006', market: 'cn', currency: 'CNY',
    feeds: { sina: 'sz399006', tencent: 'sz399006', eastmoney: '0.399006' },
  },
  {
    id: '000300', label: '沪深300 000300', market: 'cn', currency: 'CNY',
    feeds: { sina: 'sh000300', tencent: 'sh000300', eastmoney: '1.000300' },
  },
  {
    id: '002594', label: '比亚迪 002594', market: 'cn', currency: 'CNY',
    feeds: { sina: 'sz002594', tencent: 'sz002594', eastmoney: '0.002594' },
  },
  {
    id: '300750', label: '宁德时代 300750', market: 'cn', currency: 'CNY',
    feeds: { sina: 'sz300750', tencent: 'sz300750', eastmoney: '0.300750' },
  },
  {
    id: '600036', label: '招商银行 600036', market: 'cn', currency: 'CNY',
    feeds: { sina: 'sh600036', tencent: 'sh600036', eastmoney: '1.600036' },
  },
  {
    id: '601318', label: '中国平安 601318', market: 'cn', currency: 'CNY',
    feeds: { sina: 'sh601318', tencent: 'sh601318', eastmoney: '1.601318' },
  },
  // ---- 美股扩充 ----
  {
    id: 'TSLA', label: 'TSLA 特斯拉', market: 'us', currency: 'USD',
    feeds: { yahoo: 'TSLA', yahoo2: 'TSLA' },
  },
  {
    id: 'MSFT', label: 'MSFT 微软', market: 'us', currency: 'USD',
    feeds: { yahoo: 'MSFT', yahoo2: 'MSFT' },
  },
  {
    id: 'AMZN', label: 'AMZN 亚马逊', market: 'us', currency: 'USD',
    feeds: { yahoo: 'AMZN', yahoo2: 'AMZN' },
  },
  {
    id: 'GOOGL', label: 'GOOGL 谷歌', market: 'us', currency: 'USD',
    feeds: { yahoo: 'GOOGL', yahoo2: 'GOOGL' },
  },
  {
    id: 'META', label: 'META', market: 'us', currency: 'USD',
    feeds: { yahoo: 'META', yahoo2: 'META' },
  },
  {
    id: 'AMD', label: 'AMD', market: 'us', currency: 'USD',
    feeds: { yahoo: 'AMD', yahoo2: 'AMD' },
  },
  {
    id: 'SPY', label: 'SPY 标普500ETF', market: 'us', currency: 'USD',
    feeds: { yahoo: 'SPY', yahoo2: 'SPY' },
  },
  {
    id: 'QQQ', label: 'QQQ 纳指ETF', market: 'us', currency: 'USD',
    feeds: { yahoo: 'QQQ', yahoo2: 'QQQ' },
  },
  {
    id: 'COIN', label: 'COIN Coinbase', market: 'us', currency: 'USD',
    feeds: { yahoo: 'COIN', yahoo2: 'COIN' },
  },
  {
    id: 'MSTR', label: 'MSTR 微策略', market: 'us', currency: 'USD',
    feeds: { yahoo: 'MSTR', yahoo2: 'MSTR' },
  },
];

/**
 * 知名加密币种（与美股代码冲突时优先按加密解析；如 SOL）。
 * 不在此表中的纯字母代码按美股解析。
 */
const KNOWN_CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'WLD', 'BNB', 'ADA', 'AVAX', 'LINK',
  'LTC', 'SUI', 'TRX', 'DOT', 'NEAR', 'BCH', 'PEPE', 'ARB', 'OP', 'INJ',
  'TIA', 'SEI', 'HYPE', 'ENA', 'ONDO', 'JUP', 'FIL', 'ATOM', 'UNI', 'AAVE',
  'ETC', 'XLM', 'HBAR', 'ICP', 'APT', 'TON', 'SHIB', 'FET', 'RUNE', 'GRT',
]);

function cryptoInfo(base: string): SymbolInfo {
  return {
    id: `${base}/USD`, label: `${base}/USD`, market: 'crypto', currency: 'USD',
    feeds: { binance: `${base}USDT`, kraken: `${base}USD`, okx: `${base}-USDT-SWAP` },
  };
}

/**
 * 按代码动态构造品种（输代码直查）：不查表、纯规则拼各源 feed。
 * 识别不了返回 undefined。
 * - 6 位数字 → A股（6/9 开头沪市、4/8 北交所、其余深市）
 * - BASE/USD、BASE/USDT、BASEUSDT、知名币种名 → 加密（Binance 现货 + Kraken + OKX 永续）
 * - BASE-PERP → 加密永续（OKX 单源，与 BTC-PERP 预设一致）
 * - 1~5 个字母（可带 .X 类别后缀）→ 美股（Yahoo；BRK.B 拼 BRK-B）
 */
export function buildDynamicSymbol(raw: string): SymbolInfo | undefined {
  const id = raw.trim().toUpperCase();
  if (!id) return undefined;

  if (/^\d{6}$/.test(id)) {
    const isSh = id.startsWith('6') || id.startsWith('9');
    const isBj = id.startsWith('4') || id.startsWith('8');
    const prefix = isSh ? 'sh' : isBj ? 'bj' : 'sz';
    return {
      id, label: id, market: 'cn', currency: 'CNY',
      feeds: {
        sina: `${prefix}${id}`,
        tencent: `${prefix}${id}`,
        eastmoney: `${isSh ? '1' : '0'}.${id}`,
      },
    };
  }

  const perp = id.match(/^([A-Z0-9]{2,15})-PERP$/);
  if (perp) {
    return {
      id, label: `${perp[1]} 永续`, market: 'crypto', currency: 'USDT',
      feeds: { okx: `${perp[1]}-USDT-SWAP` },
    };
  }

  const pair = id.match(/^([A-Z0-9]{2,15})(?:\/USD|\/USDT|-USDT|USDT)$/);
  if (pair) return cryptoInfo(pair[1]);

  if (/^[A-Z]{2,10}$/.test(id) && KNOWN_CRYPTO_BASES.has(id)) return cryptoInfo(id);

  if (/^[A-Z]{1,5}(\.[A-Z])?$/.test(id)) {
    const yahooFeed = id.replace('.', '-');
    return {
      id, label: id, market: 'us', currency: 'USD',
      feeds: { yahoo: yahooFeed, yahoo2: yahooFeed },
    };
  }

  return undefined;
}

/** 解析品种：先查预设表，未命中按代码规则动态构造（输代码直查的后端入口）。 */
export function resolveSymbol(id: string): SymbolInfo | undefined {
  return SYMBOLS.find((s) => s.id === id) ?? buildDynamicSymbol(id);
}

/** 搜索框输入归一化：能解析成品种就返回其规范 id（预设 id 或动态 id），否则 null。 */
export function normalizeSymbolInput(raw: string): string | null {
  const q = raw.trim().toUpperCase();
  if (!q) return null;
  const found = resolveSymbol(q);
  return found ? found.id : null;
}

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
