// Pine 引擎接口（契约 CONTRACTS.md §4）
// M3 阶段 B：PineTS（npm `pinets`，AGPL-3.0）默认引擎，见 ./pinets-engine.ts。

import type { Candle } from '@/lib/data/types';

/** 单个绘图输出的点序列（time 为 unix 秒） */
export interface PinePlotPoint {
  time: number;
  value: number | null;
}

/** 一条命名绘图输出 */
export interface PinePlot {
  name: string;
  color: string;
  /** true = 叠加在价格主图；false = 独立指标刻度 */
  overlay: boolean;
  points: PinePlotPoint[];
}

/** 收益曲线点（time 为 unix 秒） */
export interface EquityPoint {
  time: number;
  equity: number;
}

/** 策略回测汇总（基于已平仓交易重建） */
export interface PineBacktest {
  initialCapital: number;
  netProfit: number;
  /** 净收益相对初始资金的百分比 */
  totalReturnPct: number;
  /** 最大回撤（金额，基于收益曲线峰值→谷值） */
  maxDrawdown: number;
  maxDrawdownPct: number;
  winRate: number;
  tradeCount: number;
  equityCurve: EquityPoint[];
}

/** 一次 Pine 运行的结果：命名绘图 + 回测 + 错误列表 */
export interface PineResult {
  plots: PinePlot[];
  errors: string[];
  isStrategy: boolean;
  backtest?: PineBacktest;
}

/** Pine 引擎运行选项 */
export interface PineRunOptions {
  timeframe?: string;
  symbolId?: string;
}

/** Pine 引擎接口 */
export interface PineEngine {
  readonly name: string;
  run(source: string, candles: Candle[], opts?: PineRunOptions): Promise<PineResult>;
}

/** 空实现：PineTS 尚未接入时返回提示错误（保留用于降级） */
export class NoopPineEngine implements PineEngine {
  readonly name = 'noop';

  async run(): Promise<PineResult> {
    return { plots: [], errors: ['M3: PineTS engine not wired yet'], isStrategy: false };
  }
}
