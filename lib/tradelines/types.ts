/** TP/SL/挂单线数据模型（纯类型 + 纯函数，无 DOM） */

export type TradeLineKind = 'tp' | 'sl' | 'order';

export interface TradeLineModel {
  id: string;
  kind: TradeLineKind;
  price: number;
}

export const TRADELINES_STORAGE_KEY = 'ttv2.tradelines.v1';

/**
 * 生成 localStorage 键：`ttv2.tradelines.v1::<paneId>::<symbolId>::<timeframe>`
 * 与画线同样按窗格 + 品种 + 周期隔离。
 */
export function tradeLinesKey(symbolId: string, timeframe: string, paneId = 'pane-0'): string {
  return `${TRADELINES_STORAGE_KEY}::${paneId}::${symbolId}::${timeframe}`;
}

/** 生成唯一线 id */
export function createTradeLineId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 各类线的展示元信息（中文标签 + 配色） */
export const TRADELINE_META: Record<TradeLineKind, { label: string; color: string; dashed: boolean }> = {
  tp: { label: 'TP', color: '#26a69a', dashed: false },
  sl: { label: 'SL', color: '#ef5350', dashed: false },
  order: { label: '挂单', color: '#2962ff', dashed: true },
};

/** 校验从 localStorage 读到的对象，非法返回 null */
export function validateTradeLineModel(raw: unknown): TradeLineModel | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0) return null;
  if (o.kind !== 'tp' && o.kind !== 'sl' && o.kind !== 'order') return null;
  if (typeof o.price !== 'number' || !Number.isFinite(o.price) || o.price <= 0) return null;
  return { id: o.id, kind: o.kind, price: o.price };
}
