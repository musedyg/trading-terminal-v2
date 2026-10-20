// 价格轴滚轮缩放纯函数单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoomPriceRange } from '../price-axis-wheel.ts';

const RANGE = { from: 100, to: 200 };

test('上滚（deltaY<0）放大：区间变窄且中心两侧同比例收缩', () => {
  const r = zoomPriceRange(RANGE, 150, -100, 0);
  assert.ok(r.to - r.from < 100, '区间应变窄');
  // 中心 150 两侧原各 50，缩放后仍对称
  assert.ok(Math.abs(150 - r.from - (r.to - 150)) < 1e-9);
});

test('下滚（deltaY>0）缩小：区间变宽', () => {
  const r = zoomPriceRange(RANGE, 150, 100, 0);
  assert.ok(r.to - r.from > 100, '区间应变宽');
});

test('缩放中心在区间边缘时，该边缘保持不动', () => {
  const r = zoomPriceRange(RANGE, 100, -100, 0);
  assert.equal(r.from, 100);
  assert.ok(r.to < 200);
});

test('连续上滚可叠加放大（第二次在第一次结果上继续变窄）', () => {
  const once = zoomPriceRange(RANGE, 150, -100, 0);
  const twice = zoomPriceRange(once, 150, -100, 0);
  assert.ok(twice.to - twice.from < once.to - once.from);
});

test('deltaMode=1（按行）与像素模式同方向生效且幅度更大', () => {
  const byLine = zoomPriceRange(RANGE, 150, -3, 1);
  const byPixel = zoomPriceRange(RANGE, 150, -3, 0);
  assert.ok(byLine.to - byLine.from < byPixel.to - byPixel.from);
});

test('超大 deltaY 被钳制：单次缩放倍率不超过 exp(240*0.0016)', () => {
  const r = zoomPriceRange(RANGE, 150, 100000, 0);
  const maxSpan = 100 * Math.exp(240 * 0.0016);
  assert.ok(r.to - r.from <= maxSpan + 1e-9);
});

test('非法区间或零增量原样返回（同一引用）', () => {
  const bad = { from: 200, to: 100 };
  assert.equal(zoomPriceRange(bad, 150, -100, 0), bad);
  assert.equal(zoomPriceRange(RANGE, 150, 0, 0), RANGE);
  assert.equal(zoomPriceRange(RANGE, Number.NaN, -100, 0), RANGE);
});
