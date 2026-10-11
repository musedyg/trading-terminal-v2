import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distToSegment,
  hitLine,
  hitRay,
  hitHLine,
  hitRect,
  hitFibo,
  hitChannel,
  hitPosition,
  hitBox,
  fiboLevelPrices,
  positionStats,
  validateDrawingModel,
} from '../geometry.ts';
import { FIBO_RATIOS } from '../types.ts';

const TOL = 5;

// ---------- distToSegment ----------
test('distToSegment: 线段上的点距离为 0', () => {
  assert.equal(distToSegment(5, 0, 0, 0, 10, 0), 0);
});

test('distToSegment: 点在线段外，距离为到最近端点的距离', () => {
  assert.equal(distToSegment(15, 0, 0, 0, 10, 0), 5);
});

// ---------- hitLine ----------
test('hitLine: 线段附近命中', () => {
  assert.equal(hitLine(5, 3, 0, 0, 10, 0, TOL), true);
});

test('hitLine: 远离线段未命中', () => {
  assert.equal(hitLine(5, 30, 0, 0, 10, 0, TOL), false);
});

test('hitLine: 线段端点之外未命中', () => {
  assert.equal(hitLine(20, 1, 0, 0, 10, 0, TOL), false);
});

// ---------- hitRay ----------
test('hitRay: 射线正方向延长线上命中', () => {
  // 从 (0,0) 出发经过 (10,0) 的射线，点 (20, 2) 在射线前方 2px 处
  assert.equal(hitRay(20, 2, 0, 0, 10, 0, TOL), true);
});

test('hitRay: 起点反方向不命中', () => {
  // 点 (-20, 0) 在射线反方向，即使距离在线上也未命中
  assert.equal(hitRay(-20, 0, 0, 0, 10, 0, TOL), false);
});

// ---------- hitHLine ----------
test('hitHLine: 水平线上下容差内命中', () => {
  assert.equal(hitHLine(102, 100, 50, 0, 100, TOL), true);
});

test('hitHLine: x 超出线段范围未命中', () => {
  assert.equal(hitHLine(100, 100, 200, 0, 100, TOL), false);
});

// ---------- hitRect ----------
test('hitRect: 矩形内部命中', () => {
  assert.equal(hitRect(50, 50, 0, 0, 100, 100, TOL), true);
});

test('hitRect: 边框附近命中', () => {
  assert.equal(hitRect(102, 50, 0, 0, 100, 100, TOL), true);
});

test('hitRect: 矩形外远处未命中', () => {
  assert.equal(hitRect(150, 50, 0, 0, 100, 100, TOL), false);
});

// ---------- hitFibo ----------
test('hitFibo: 靠近某条斐波那契线命中', () => {
  assert.equal(hitFibo(50, 62, 0, 100, [0, 61.8, 100], TOL), true);
});

test('hitFibo: 远离所有水平线未命中', () => {
  assert.equal(hitFibo(50, 30, 0, 100, [0, 61.8, 100], TOL), false);
});

// ---------- hitChannel ----------
test('hitChannel: 靠近主线命中', () => {
  assert.equal(hitChannel(50, 3, 0, 0, 100, 0, 0, 40, TOL), true);
});

test('hitChannel: 靠近过 o 点的平行线命中', () => {
  assert.equal(hitChannel(50, 42, 0, 0, 100, 0, 0, 40, TOL), true);
});

test('hitChannel: 远离两条线未命中', () => {
  assert.equal(hitChannel(50, 80, 0, 0, 100, 0, 0, 40, TOL), false);
});

// ---------- hitPosition ----------
test('hitPosition: 靠近入场线命中', () => {
  assert.equal(hitPosition(50, 101, 0, 100, 100, 80, 130, TOL), true);
});

test('hitPosition: 止盈框内命中', () => {
  // entry=100, tp=130：点 (50, 120) 在盈利框内部
  assert.equal(hitPosition(50, 120, 0, 100, 100, 80, 130, TOL), true);
});

test('hitPosition: 远离所有区域未命中', () => {
  assert.equal(hitPosition(50, 200, 0, 100, 100, 80, 130, TOL), false);
});

// ---------- hitBox ----------
test('hitBox: 框内命中（含 tol 外扩）', () => {
  assert.equal(hitBox(105, 50, { x: 0, y: 0, w: 100, h: 100 }, 10), true);
});

test('hitBox: 框外远处未命中', () => {
  assert.equal(hitBox(150, 50, { x: 0, y: 0, w: 100, h: 100 }, 10), false);
});

test('hitBox: 负宽高矩形也能正常判定', () => {
  assert.equal(hitBox(50, 50, { x: 100, y: 100, w: -100, h: -100 }, 0), true);
});

// ---------- fiboLevelPrices ----------
test('fiboLevelPrices: 上升趋势，1 位置在最高点', () => {
  const levels = fiboLevelPrices({ time: 1, price: 100 }, { time: 2, price: 200 }, FIBO_RATIOS);
  assert.equal(levels.length, FIBO_RATIOS.length);
  assert.equal(levels[0]!.ratio, 0);
  assert.equal(levels[0]!.price, 100);
  const last = levels[levels.length - 1]!;
  assert.equal(last.ratio, 1);
  assert.equal(last.price, 200);
  const mid = levels.find((l) => l.ratio === 0.5)!;
  assert.equal(mid.price, 150);
});

test('fiboLevelPrices: 下降趋势，1 位置在最低点', () => {
  const levels = fiboLevelPrices({ time: 1, price: 200 }, { time: 2, price: 100 }, FIBO_RATIOS);
  const last = levels[levels.length - 1]!;
  assert.equal(last.ratio, 1);
  assert.equal(last.price, 100);
  const mid = levels.find((l) => l.ratio === 0.618)!;
  assert.ok(Math.abs(mid.price - 138.2) < 1e-9);
});

// ---------- positionStats ----------
test('positionStats: 多头方向与盈亏比', () => {
  const s = positionStats(100, 90, 120);
  assert.equal(s.dir, 'long');
  assert.equal(s.riskPct, 10);
  assert.equal(s.rewardPct, 20);
  assert.equal(s.rr, 2);
});

test('positionStats: 空头方向与盈亏比', () => {
  const s = positionStats(100, 110, 80);
  assert.equal(s.dir, 'short');
  assert.equal(s.riskPct, 10);
  assert.equal(s.rewardPct, 20);
  assert.equal(s.rr, 2);
});

test('positionStats: risk=0 时 rr=0', () => {
  const s = positionStats(100, 100, 120);
  assert.equal(s.riskPct, 0);
  assert.equal(s.rr, 0);
  // tp>entry → 歧义兜底判 long
  assert.equal(s.dir, 'long');
});

// ---------- validateDrawingModel ----------
function validModel(): Record<string, unknown> {
  return {
    id: 'dabc123',
    tool: 'trend',
    points: [{ time: 1700000000, price: 100 }],
    style: { color: '#2962ff', lineWidth: 2 },
    createdAt: 1700000000000,
  };
}

test('validateDrawingModel: 合法模型通过', () => {
  const m = validateDrawingModel(validModel());
  assert.notEqual(m, null);
  assert.equal(m!.tool, 'trend');
});

test('validateDrawingModel: 缺字段返回 null', () => {
  const obj = validModel();
  delete obj['style'];
  assert.equal(validateDrawingModel(obj), null);
});

test('validateDrawingModel: points 为空返回 null', () => {
  const obj = validModel();
  obj['points'] = [];
  assert.equal(validateDrawingModel(obj), null);
});

test('validateDrawingModel: tool 非法返回 null', () => {
  const obj = validModel();
  obj['tool'] = 'select';
  assert.equal(validateDrawingModel(obj), null);
});

test('validateDrawingModel: 非法颜色返回 null', () => {
  const obj = validModel();
  obj['style'] = { color: 'red', lineWidth: 2 };
  assert.equal(validateDrawingModel(obj), null);
});
