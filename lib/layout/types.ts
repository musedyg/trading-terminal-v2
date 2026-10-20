// 命名布局与分屏窗格模型（M3 阶段 A）：纯数据 + localStorage 读写，无 DOM
import { SYMBOLS, TIMEFRAMES, resolveSymbol, type Timeframe } from '../symbols.ts';

export type PaneCount = 1 | 2 | 4 | 6;
export const PANE_COUNTS: PaneCount[] = [1, 2, 4, 6];
export const MAX_PANES = 6;

/** 单个窗格：id 按网格序号稳定（pane-0..pane-5），画线按窗格隔离 */
export interface PaneState {
  id: string;
  symbolId: string;
  timeframe: Timeframe;
}

export interface NamedLayout {
  id: string;
  name: string;
  paneCount: PaneCount;
  panes: PaneState[];
  createdAt: number;
  updatedAt: number;
}

export const LAYOUTS_KEY = 'ttv2.layouts.v1';

/** 网格序号 → 稳定窗格 id */
export function paneId(index: number): string {
  return `pane-${index}`;
}

function isTimeframe(v: unknown): v is Timeframe {
  return typeof v === 'string' && (TIMEFRAMES as readonly string[]).includes(v);
}

function validSymbolId(id: unknown): boolean {
  return typeof id === 'string' && resolveSymbol(id) !== undefined;
}

function isPaneCount(n: unknown): n is PaneCount {
  return n === 1 || n === 2 || n === 4 || n === 6;
}

/** 默认窗格：首个品种 + 1d */
export function defaultPanes(count: PaneCount): PaneState[] {
  const out: PaneState[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ id: paneId(i), symbolId: SYMBOLS[0].id, timeframe: '1d' });
  }
  return out;
}

/** 分屏数变化时保留已有窗格的品种/周期配置 */
export function normalizePanes(panes: PaneState[], count: PaneCount): PaneState[] {
  const out = panes.slice(0, count).map((p, i) => ({ ...p, id: paneId(i) }));
  while (out.length < count) {
    const i = out.length;
    out.push({ id: paneId(i), symbolId: SYMBOLS[0].id, timeframe: '1d' });
  }
  return out;
}

function sanitizePane(p: unknown, index: number): PaneState {
  const o = (p ?? {}) as Record<string, unknown>;
  return {
    id: paneId(index),
    symbolId: validSymbolId(o.symbolId) ? (o.symbolId as string) : SYMBOLS[0].id,
    timeframe: isTimeframe(o.timeframe) ? o.timeframe : '1d',
  };
}

/** 校验并清洗一条布局记录；非法返回 null */
export function sanitizeLayout(input: unknown): NamedLayout | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  if (typeof o.name !== 'string' || o.name.trim().length === 0) return null;
  if (!isPaneCount(o.paneCount)) return null;
  if (!Array.isArray(o.panes)) return null;
  const panes = o.panes.map((p, i) => sanitizePane(p, i));
  const count = o.paneCount;
  return {
    id: typeof o.id === 'string' && o.id.length > 0 ? o.id : createLayoutId(),
    name: o.name.trim().slice(0, 40),
    paneCount: count,
    panes: normalizePanes(panes, count),
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
  };
}

export function createLayoutId(): string {
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 读取全部命名布局；无 localStorage（SSR）或格式非法时返回 [] */
export function loadLayouts(): NamedLayout[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LAYOUTS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: NamedLayout[] = [];
    for (const item of parsed) {
      const l = sanitizeLayout(item);
      if (l !== null) out.push(l);
    }
    return out;
  } catch {
    return [];
  }
}

/** 覆盖保存全部命名布局；失败静默跳过 */
export function saveLayouts(list: NamedLayout[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(list));
  } catch {
    // 配额不足或不可用：静默跳过
  }
}
