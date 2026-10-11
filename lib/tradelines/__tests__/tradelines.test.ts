/** TP/SL/挂单线模块单测：模型校验 + store 增删改 + key 生成 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTradeLineId,
  tradeLinesKey,
  validateTradeLineModel,
  type TradeLineModel,
} from '../types.ts';
import { TradeLineStore } from '../store.ts';

const base: TradeLineModel = { id: 't1', kind: 'tp', price: 70000 };

describe('tradeLinesKey', () => {
  it('按窗格/品种/周期隔离', () => {
    const k1 = tradeLinesKey('BTCUSDT', '1h', 'pane-0');
    const k2 = tradeLinesKey('BTCUSDT', '1h', 'pane-1');
    const k3 = tradeLinesKey('ETHUSDT', '1h', 'pane-0');
    assert.notEqual(k1, k2);
    assert.notEqual(k1, k3);
    assert.ok(k1.startsWith('ttv2.tradelines.v1::'));
  });
});

describe('validateTradeLineModel', () => {
  it('合法模型通过', () => {
    assert.deepEqual(validateTradeLineModel({ ...base }), base);
    assert.deepEqual(validateTradeLineModel({ id: 'x', kind: 'sl', price: 1 }), {
      id: 'x',
      kind: 'sl',
      price: 1,
    });
  });
  it('非法 kind/price 被拒绝', () => {
    assert.equal(validateTradeLineModel({ ...base, kind: 'limit' }), null);
    assert.equal(validateTradeLineModel({ ...base, price: 0 }), null);
    assert.equal(validateTradeLineModel({ ...base, price: -5 }), null);
    assert.equal(validateTradeLineModel(null), null);
  });
});

describe('TradeLineStore', () => {
  it('增删 + 改价（非法价格拒绝）', () => {
    const s = new TradeLineStore();
    s.add({ ...base });
    s.add({ id: 't2', kind: 'sl', price: 65000 });
    s.add({ id: 't3', kind: 'order', price: 68000 });
    assert.equal(s.list().length, 3);
    s.updatePrice('t1', 71000);
    assert.equal(s.get('t1')?.price, 71000);
    s.updatePrice('t1', -1); // 非法：不变
    assert.equal(s.get('t1')?.price, 71000);
    s.updatePrice('t1', NaN);
    assert.equal(s.get('t1')?.price, 71000);
    assert.equal(s.remove('t3'), true);
    assert.equal(s.list().length, 2);
  });
  it('id 唯一', () => {
    assert.notEqual(createTradeLineId(), createTradeLineId());
  });
});
