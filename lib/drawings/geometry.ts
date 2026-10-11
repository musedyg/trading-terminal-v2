/** 画线纯几何逻辑：全部用像素坐标 {x, y} 运算，零 DOM，可单测 */
import type { DrawingModel, DrawingPoint, DrawingTool } from './types.ts';

/** 点 (px,py) 到线段 ab 的最短距离 */
export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** 是否命中线段 a→b（容差 tol 像素） */
export function hitLine(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tol: number,
): boolean {
  return distToSegment(px, py, ax, ay, bx, by) <= tol;
}

/** 是否命中从 a 出发经过 b 的射线 */
export function hitRay(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tol: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(px - ax, py - ay) <= tol;
  }
  // 投影参数 t：t<0 说明点在射线反方向，不命中
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) return false;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy) <= tol;
}

/** 是否命中水平线 y=lineY（x 范围在 [x0,x1] 区间内，容差 tol） */
export function hitHLine(
  py: number,
  lineY: number,
  px: number,
  x0: number,
  x1: number,
  tol: number,
): boolean {
  if (Math.abs(py - lineY) > tol) return false;
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  return px >= lo - tol && px <= hi + tol;
}

/** 是否命中矩形：内部或边框附近都算命中 */
export function hitRect(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tol: number,
): boolean {
  const loX = Math.min(x0, x1);
  const hiX = Math.max(x0, x1);
  const loY = Math.min(y0, y1);
  const hiY = Math.max(y0, y1);
  // 内部
  if (px >= loX && px <= hiX && py >= loY && py <= hiY) return true;
  // 边框附近：到四条边线段的最短距离
  const edges: [number, number, number, number][] = [
    [loX, loY, hiX, loY],
    [hiX, loY, hiX, hiY],
    [hiX, hiY, loX, hiY],
    [loX, hiY, loX, loY],
  ];
  return edges.some(([ax, ay, bx, by]) => distToSegment(px, py, ax, ay, bx, by) <= tol);
}

/** 是否命中斐波那契水平线中的任一条（x 范围在 [x0,x1]） */
export function hitFibo(
  px: number,
  py: number,
  x0: number,
  x1: number,
  levelYs: number[],
  tol: number,
): boolean {
  return levelYs.some((levelY) => hitHLine(py, levelY, px, x0, x1, tol));
}

/** 是否命中通道：靠近主线 a→b 或过 o 点的平行线 */
export function hitChannel(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ox: number,
  oy: number,
  tol: number,
): boolean {
  if (hitLine(px, py, ax, ay, bx, by, tol)) return true;
  // 过 o 点的平行线：方向与 a→b 相同
  const dx = bx - ax;
  const dy = by - ay;
  const bx2 = ox + dx;
  const by2 = oy + dy;
  return hitLine(px, py, ox, oy, bx2, by2, tol);
}

/** 是否命中多空持仓标记：靠近入场/止损/目标三条线之一，或在盈亏框内 */
export function hitPosition(
  px: number,
  py: number,
  x0: number,
  x1: number,
  entryY: number,
  slY: number,
  tpY: number,
  tol: number,
): boolean {
  if (
    hitHLine(py, entryY, px, x0, x1, tol) ||
    hitHLine(py, slY, px, x0, x1, tol) ||
    hitHLine(py, tpY, px, x0, x1, tol)
  ) {
    return true;
  }
  // 盈亏框：x 在 [x0,x1]，y 在 entryY 与 tpY / slY 之间
  const loX = Math.min(x0, x1);
  const hiX = Math.max(x0, x1);
  if (px < loX || px > hiX) return false;
  const profitLo = Math.min(entryY, tpY);
  const profitHi = Math.max(entryY, tpY);
  const lossLo = Math.min(entryY, slY);
  const lossHi = Math.max(entryY, slY);
  return (py >= profitLo && py <= profitHi) || (py >= lossLo && py <= lossHi);
}

/** 是否命中矩形框 box（含 tol 向外扩展） */
export function hitBox(
  px: number,
  py: number,
  box: { x: number; y: number; w: number; h: number },
  tol: number,
): boolean {
  const loX = Math.min(box.x, box.x + box.w);
  const hiX = Math.max(box.x, box.x + box.w);
  const loY = Math.min(box.y, box.y + box.h);
  const hiY = Math.max(box.y, box.y + box.h);
  return px >= loX - tol && px <= hiX + tol && py >= loY - tol && py <= hiY + tol;
}

/** 斐波那契各回撤位的价格：price = p1.price + (p2.price - p1.price) * ratio */
export function fiboLevelPrices(
  p1: DrawingPoint,
  p2: DrawingPoint,
  ratios: readonly number[] = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
): { ratio: number; price: number }[] {
  const range = p2.price - p1.price;
  return ratios.map((ratio) => ({ ratio, price: p1.price + range * ratio }));
}

export interface PositionStats {
  dir: 'long' | 'short';
  riskPct: number;
  rewardPct: number;
  rr: number;
}

/**
 * 持仓统计。方向规则：sl<entry && tp>entry → long；sl>entry && tp<entry → short；
 * 其它歧义情况按 tp>entry ? long : short。
 * riskPct = |entry-sl|/entry*100；rewardPct = |tp-entry|/entry*100；rr = reward/risk（risk=0 时 rr=0）
 */
export function positionStats(entry: number, sl: number, tp: number): PositionStats {
  let dir: 'long' | 'short';
  if (sl < entry && tp > entry) {
    dir = 'long';
  } else if (sl > entry && tp < entry) {
    dir = 'short';
  } else {
    dir = tp > entry ? 'long' : 'short';
  }
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  const riskPct = entry !== 0 ? (risk / Math.abs(entry)) * 100 : 0;
  const rewardPct = entry !== 0 ? (reward / Math.abs(entry)) * 100 : 0;
  const rr = risk === 0 ? 0 : reward / risk;
  return { dir, riskPct, rewardPct, rr };
}

const VALID_TOOLS: ReadonlySet<string> = new Set<string>([
  'trend',
  'ray',
  'hline',
  'rect',
  'fibo',
  'channel',
  'long',
  'short',
  'text',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isPoint(v: unknown): v is DrawingPoint {
  return (
    isRecord(v) &&
    typeof v['time'] === 'number' &&
    Number.isFinite(v['time']) &&
    typeof v['price'] === 'number' &&
    Number.isFinite(v['price'])
  );
}

function isHexColor(v: unknown): boolean {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

/** 严格校验画线模型，非法返回 null */
export function validateDrawingModel(obj: unknown): DrawingModel | null {
  if (!isRecord(obj)) return null;
  if (typeof obj['id'] !== 'string' || obj['id'].length === 0) return null;
  if (typeof obj['tool'] !== 'string' || !VALID_TOOLS.has(obj['tool'])) return null;
  if (!Array.isArray(obj['points']) || obj['points'].length === 0) return null;
  if (!obj['points'].every(isPoint)) return null;
  if (!isRecord(obj['style'])) return null;
  const style = obj['style'];
  if (!isHexColor(style['color'])) return null;
  if (typeof style['lineWidth'] !== 'number' || !Number.isFinite(style['lineWidth'])) return null;
  if (style['dashed'] !== undefined && typeof style['dashed'] !== 'boolean') return null;
  if (
    style['fillOpacity'] !== undefined &&
    (typeof style['fillOpacity'] !== 'number' || !Number.isFinite(style['fillOpacity']))
  ) {
    return null;
  }
  if (style['text'] !== undefined && typeof style['text'] !== 'string') return null;
  if (
    style['fontSize'] !== undefined &&
    (typeof style['fontSize'] !== 'number' || !Number.isFinite(style['fontSize']))
  ) {
    return null;
  }
  if (
    typeof obj['createdAt'] !== 'number' ||
    !Number.isFinite(obj['createdAt'])
  ) {
    return null;
  }
  return obj as unknown as DrawingModel;
}

export type { DrawingModel, DrawingPoint, DrawingTool };
