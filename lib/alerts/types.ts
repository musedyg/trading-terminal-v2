/** 价格预警数据模型（纯类型 + 纯函数，无 DOM） */

export type AlertDirection = 'above' | 'below';

export interface AlertModel {
  id: string;
  symbolId: string;
  symbolLabel: string;
  direction: AlertDirection;
  price: number;
  createdAt: number;
  /** null = 监控中；时间戳 = 已触发（只触发一次） */
  triggeredAt: number | null;
}

export const ALERTS_STORAGE_KEY = 'ttv2.alerts.v1';

/** 生成唯一预警 id */
export function createAlertId(): string {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 校验从 localStorage 读到的对象，非法返回 null */
export function validateAlertModel(raw: unknown): AlertModel | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0) return null;
  if (typeof o.symbolId !== 'string' || o.symbolId.length === 0) return null;
  if (typeof o.symbolLabel !== 'string') return null;
  if (o.direction !== 'above' && o.direction !== 'below') return null;
  if (typeof o.price !== 'number' || !Number.isFinite(o.price) || o.price <= 0) return null;
  if (typeof o.createdAt !== 'number') return null;
  if (o.triggeredAt !== null && typeof o.triggeredAt !== 'number') return null;
  return {
    id: o.id,
    symbolId: o.symbolId,
    symbolLabel: o.symbolLabel,
    direction: o.direction,
    price: o.price,
    createdAt: o.createdAt,
    triggeredAt: o.triggeredAt,
  };
}

/**
 * 检查预警是否触发（纯函数，可单测）。
 * - above：最新价 >= 预警价 → 触发
 * - below：最新价 <= 预警价 → 触发
 */
export function isAlertTriggered(alert: AlertModel, lastPrice: number): boolean {
  if (!Number.isFinite(lastPrice)) return false;
  return alert.direction === 'above' ? lastPrice >= alert.price : lastPrice <= alert.price;
}
