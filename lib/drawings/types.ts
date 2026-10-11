/** 画线工具类型与数据模型（纯类型 + 纯函数，无 DOM） */

/** 画线锚点：time 为 unix 秒 */
export interface DrawingPoint {
  time: number;
  price: number;
}

export type ToolType =
  | 'select'
  | 'trend'
  | 'ray'
  | 'hline'
  | 'rect'
  | 'fibo'
  | 'channel'
  | 'long'
  | 'short'
  | 'text';

/** 除 select 外的工具即为可绘制工具 */
export type DrawingTool = Exclude<ToolType, 'select'>;

export interface DrawingStyle {
  color: string;
  lineWidth: number;
  dashed?: boolean;
  fillOpacity?: number;
  text?: string;
  fontSize?: number;
}

export interface DrawingModel {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  style: DrawingStyle;
  createdAt: number;
}

export const FIBO_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export const STORAGE_PREFIX = 'ttv2.drawings.v1';

/**
 * 生成 localStorage 键：`ttv2.drawings.v1::<paneId>::<symbolId>::<timeframe>`
 * M3 阶段 A 起画线按窗格隔离（paneId 默认为 'pane-0'，兼容单窗格旧调用）。
 */
export function storageKey(symbolId: string, timeframe: string, paneId = 'pane-0'): string {
  return `${STORAGE_PREFIX}::${paneId}::${symbolId}::${timeframe}`;
}

/** M2 旧键（无窗格维度）：仅用于迁移读取，写入一律走新键 */
export function legacyStorageKey(symbolId: string, timeframe: string): string {
  return `${STORAGE_PREFIX}::${symbolId}::${timeframe}`;
}

/** 生成唯一画线 id */
export function createDrawingId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 各工具默认样式 */
export const TOOL_DEFAULT_STYLE: Record<DrawingTool, DrawingStyle> = {
  trend: { color: '#2962ff', lineWidth: 2 },
  ray: { color: '#2962ff', lineWidth: 2 },
  hline: { color: '#787b86', lineWidth: 1, dashed: true },
  rect: { color: '#2962ff', lineWidth: 1, fillOpacity: 0.12 },
  fibo: { color: '#f23645', lineWidth: 1 },
  channel: { color: '#2962ff', lineWidth: 1, fillOpacity: 0.08 },
  long: { color: '#2962ff', lineWidth: 2 },
  short: { color: '#f23645', lineWidth: 2 },
  text: { color: '#d1d4dc', lineWidth: 1, fontSize: 13 },
};
