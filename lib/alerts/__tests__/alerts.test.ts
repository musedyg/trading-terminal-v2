/** 预警模块单测：触发判定 + 模型校验 + store 增删改 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAlertId,
  isAlertTriggered,
  validateAlertModel,
  type AlertModel,
} from '../types.ts';
import { AlertStore } from '../store.ts';

const base: AlertModel = {
  id: 'a1',
  symbolId: 'BTCUSDT',
  symbolLabel: 'BTC/USDT',
  direction: 'above',
  price: 70000,
  createdAt: 1000,
  triggeredAt: null,
};

describe('isAlertTriggered', () => {
  it('上破：最新价 >= 预警价时触发', () => {
    assert.equal(isAlertTriggered(base, 70000), true);
    assert.equal(isAlertTriggered(base, 70001), true);
    assert.equal(isAlertTriggered(base, 69999), false);
  });
  it('下破：最新价 <= 预警价时触发', () => {
    const a = { ...base, direction: 'below' as const };
    assert.equal(isAlertTriggered(a, 70000), true);
    assert.equal(isAlertTriggered(a, 69999), true);
    assert.equal(isAlertTriggered(a, 70001), false);
  });
  it('非法价格不触发', () => {
    assert.equal(isAlertTriggered(base, NaN), false);
    assert.equal(isAlertTriggered(base, Infinity), false);
  });
});

describe('validateAlertModel', () => {
  it('合法模型通过', () => {
    assert.deepEqual(validateAlertModel({ ...base }), base);
  });
  it('非法 direction/price 被拒绝', () => {
    assert.equal(validateAlertModel({ ...base, direction: 'sideways' }), null);
    assert.equal(validateAlertModel({ ...base, price: -1 }), null);
    assert.equal(validateAlertModel({ ...base, price: NaN }), null);
    assert.equal(validateAlertModel(null), null);
    assert.equal(validateAlertModel([]), null);
  });
});

describe('AlertStore', () => {
  it('增删 + 标记触发（只触发一次）', () => {
    const s = new AlertStore();
    s.add({ ...base });
    s.add({ ...base, id: 'a2', direction: 'below', price: 60000 });
    assert.equal(s.list().length, 2);
    s.markTriggered('a1', 2000);
    assert.equal(s.get('a1')?.triggeredAt, 2000);
    s.markTriggered('a1', 3000); // 第二次不覆盖
    assert.equal(s.get('a1')?.triggeredAt, 2000);
    assert.equal(s.remove('a2'), true);
    assert.equal(s.list().length, 1);
    assert.equal(s.remove('nope'), false);
  });
  it('id 唯一', () => {
    assert.notEqual(createAlertId(), createAlertId());
  });
});
