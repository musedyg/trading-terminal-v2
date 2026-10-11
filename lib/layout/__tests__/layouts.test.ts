// 布局模型单测（纯函数 + localStorage mock），风格与 M2 单测一致
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPanes,
  normalizePanes,
  sanitizeLayout,
  loadLayouts,
  saveLayouts,
  paneId,
  LAYOUTS_KEY,
  type NamedLayout,
  type PaneState,
} from '../types.ts';

// --- localStorage mock ---
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => {
    mem.set(k, v);
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

beforeEach(() => {
  mem.clear();
});

test('paneId: 按序号生成稳定 id', () => {
  assert.equal(paneId(0), 'pane-0');
  assert.equal(paneId(5), 'pane-5');
});

test('defaultPanes: 生成指定数量的默认窗格', () => {
  const panes = defaultPanes(4);
  assert.equal(panes.length, 4);
  assert.equal(panes[0].id, 'pane-0');
  assert.equal(panes[3].id, 'pane-3');
  assert.ok(panes.every((p) => p.timeframe === '1d'));
});

test('normalizePanes: 扩容保留已有配置', () => {
  const panes: PaneState[] = [
    { id: 'pane-0', symbolId: '600519', timeframe: '1h' },
    { id: 'pane-1', symbolId: 'AAPL', timeframe: '1d' },
  ];
  const out = normalizePanes(panes, 4);
  assert.equal(out.length, 4);
  assert.deepEqual(
    { id: out[0].id, symbolId: out[0].symbolId, timeframe: out[0].timeframe },
    { id: 'pane-0', symbolId: '600519', timeframe: '1h' },
  );
  assert.equal(out[2].id, 'pane-2');
});

test('normalizePanes: 缩容截断多余窗格', () => {
  const panes: PaneState[] = [
    { id: 'pane-0', symbolId: '600519', timeframe: '1h' },
    { id: 'pane-1', symbolId: 'AAPL', timeframe: '1d' },
  ];
  const out = normalizePanes(panes, 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].symbolId, '600519');
});

test('sanitizeLayout: 合法布局通过并规范化', () => {
  const l = sanitizeLayout({
    id: 'l1',
    name: '我的布局',
    paneCount: 2,
    panes: [
      { id: 'whatever', symbolId: '600519', timeframe: '1h' },
      { id: 'x', symbolId: '不存在的品种', timeframe: '9z' },
    ],
    createdAt: 1,
    updatedAt: 2,
  });
  assert.ok(l !== null);
  assert.equal(l!.panes[0].id, 'pane-0');
  assert.equal(l!.panes[0].symbolId, '600519');
  // 非法品种/周期回退到默认值
  assert.equal(l!.panes[1].symbolId, 'BTC/USD');
  assert.equal(l!.panes[1].timeframe, '1d');
});

test('sanitizeLayout: 非法输入返回 null', () => {
  assert.equal(sanitizeLayout(null), null);
  assert.equal(sanitizeLayout({}), null);
  assert.equal(sanitizeLayout({ name: '', paneCount: 2, panes: [] }), null);
  assert.equal(sanitizeLayout({ name: 'x', paneCount: 3, panes: [] }), null);
  assert.equal(sanitizeLayout({ name: 'x', paneCount: 2 }), null);
});

test('loadLayouts: 空存储返回 []', () => {
  assert.deepEqual(loadLayouts(), []);
});

test('loadLayouts/saveLayouts: 保存后可读回，非法条目被过滤', () => {
  const good: NamedLayout = {
    id: 'l1',
    name: '布局一',
    paneCount: 2,
    panes: defaultPanes(2),
    createdAt: 1,
    updatedAt: 2,
  };
  saveLayouts([good, { id: 'bad', name: '', paneCount: 2, panes: [] } as unknown as NamedLayout]);
  const back = loadLayouts();
  assert.equal(back.length, 1);
  assert.equal(back[0].name, '布局一');
  assert.equal(back[0].panes.length, 2);
});

test('loadLayouts: 坏 JSON 不抛异常', () => {
  mem.set(LAYOUTS_KEY, '{not json');
  assert.deepEqual(loadLayouts(), []);
});
