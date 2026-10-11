import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DrawingStore } from '../store.ts';
import { storageKey, TOOL_DEFAULT_STYLE } from '../types.ts';
import type { DrawingModel } from '../types.ts';

function makeModel(id: string, tool: 'trend' | 'rect' = 'trend'): DrawingModel {
  return {
    id,
    tool,
    points: [{ time: 1700000000, price: 100 }],
    style: { ...TOOL_DEFAULT_STYLE[tool] },
    createdAt: 1700000000000,
  };
}

let store: DrawingStore;

beforeEach(() => {
  store = new DrawingStore();
});

afterEach(() => {
  // store 是纯内存对象，每轮重新创建即可，无需清理
});

test('add/list/get: 添加后可列出和取出', () => {
  const m = makeModel('d1');
  store.add(m);
  assert.equal(store.list().length, 1);
  assert.deepEqual(store.get('d1'), m);
});

test('update: 打补丁更新字段', () => {
  store.add(makeModel('d1'));
  store.update('d1', { style: { color: '#ff0000', lineWidth: 3 } });
  assert.equal(store.get('d1')!.style.color, '#ff0000');
  assert.equal(store.get('d1')!.id, 'd1');
});

test('update: 不存在的 id 静默忽略', () => {
  store.update('nope', { tool: 'rect' });
  assert.equal(store.list().length, 0);
});

test('remove: 存在返回 true 并删除', () => {
  store.add(makeModel('d1'));
  assert.equal(store.remove('d1'), true);
  assert.equal(store.get('d1'), undefined);
});

test('remove: 不存在返回 false', () => {
  assert.equal(store.remove('nope'), false);
});

test('remove: 删除被选中的画线会清除选中态', () => {
  store.add(makeModel('d1'));
  store.select('d1');
  store.remove('d1');
  assert.equal(store.getSelectedId(), null);
});

test('select: 切换选中态', () => {
  store.select('d1');
  assert.equal(store.getSelectedId(), 'd1');
  store.select(null);
  assert.equal(store.getSelectedId(), null);
});

test('clear: 清空全部并重置选中', () => {
  store.add(makeModel('d1'));
  store.add(makeModel('d2'));
  store.select('d1');
  store.clear();
  assert.equal(store.list().length, 0);
  assert.equal(store.getSelectedId(), null);
});

test('subscribe: 变更后通知订阅者，取消后不再通知', () => {
  let calls = 0;
  const unsub = store.subscribe(() => {
    calls++;
  });
  store.add(makeModel('d1'));
  store.select('d1');
  assert.equal(calls, 2);
  unsub();
  store.add(makeModel('d2'));
  assert.equal(calls, 2);
});

test('subscribe: 多个订阅者都收到通知', () => {
  const counts = [0, 0];
  store.subscribe(() => counts[0]++);
  store.subscribe(() => counts[1]++);
  store.add(makeModel('d1'));
  assert.deepEqual(counts, [1, 1]);
});

// ---------- save / load 回环 ----------
// node v24 无内置 localStorage，这里注入一个最小内存实现
const memStorage = new Map<string, string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).localStorage = {
  getItem: (k: string) => (memStorage.has(k) ? memStorage.get(k)! : null),
  setItem: (k: string, v: string) => {
    memStorage.set(k, v);
  },
  removeItem: (k: string) => {
    memStorage.delete(k);
  },
  clear: () => memStorage.clear(),
};

beforeEach(() => {
  memStorage.clear();
});

test('save→load 回环：数据一致', () => {
  const key = storageKey('BINANCE:BTCUSDT', '1h');
  const m1 = makeModel('d1', 'trend');
  const m2 = makeModel('d2', 'rect');
  store.add(m1);
  store.add(m2);
  store.save(key);
  const loaded = DrawingStore.load(key);
  assert.deepEqual(loaded, [m1, m2]);
});

test('load: 键不存在返回 []', () => {
  assert.deepEqual(DrawingStore.load('ttv2.drawings.v1::no::such'), []);
});

test('load: 坏 JSON 返回 []', () => {
  const key = storageKey('X', 'Y');
  memStorage.set(key, '{not valid json');
  assert.deepEqual(DrawingStore.load(key), []);
});

test('load: 非数组 JSON 返回 []', () => {
  const key = storageKey('X', 'Y');
  memStorage.set(key, '{"a":1}');
  assert.deepEqual(DrawingStore.load(key), []);
});

test('load: 非法条目被过滤，合法条目保留', () => {
  const key = storageKey('X', 'Y');
  const good = makeModel('d1');
  memStorage.set(
    key,
    JSON.stringify([good, { id: 'bad', tool: 'nonsense' }, null]),
  );
  const loaded = DrawingStore.load(key);
  assert.deepEqual(loaded, [good]);
});
