import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DrawingsController, type DrawUiEvent } from '../controller.ts';
import { DrawingStore } from '../store.ts';
import { storageKey } from '../types.ts';

// ---------- 手写 mock ----------
// 线性坐标映射：time = 1700000000 + x；price = (1000 - y) / 4

const T0 = 1700000000;
const xOf = (t: number): number => t - T0;
const yOf = (p: number): number => 1000 - p * 4;

const mockTimeScale = {
  timeToCoordinate: (t: number): number | null => xOf(t),
  coordinateToTime: (x: number): number | null => T0 + x,
};

const attached: { attached: (p: unknown) => void; detached: () => void }[] = [];

const mockSeries: Record<string, unknown> = {
  priceToCoordinate: (p: number): number | null => yOf(p),
  coordinateToPrice: (y: number): number | null => (1000 - y) / 4,
  attachPrimitive: (p: { attached: (arg: unknown) => void }) => {
    attached.push(p as never);
    p.attached({ chart: mockChart, series: mockSeries, requestUpdate: () => {} });
  },
  detachPrimitive: (p: { detached: () => void }) => {
    const i = attached.indexOf(p as never);
    if (i >= 0) attached.splice(i, 1);
    p.detached();
  },
};

const listeners: Record<string, Set<(...args: never[]) => void>> = {};

const mockElement = {
  style: {} as Record<string, string>,
  handlers: {} as Record<string, ((e: never) => void)[]>,
  addEventListener(type: string, fn: (e: never) => void) {
    (this.handlers[type] ??= []).push(fn);
  },
  removeEventListener(type: string, fn: (e: never) => void) {
    const arr = this.handlers[type];
    if (arr) this.handlers[type] = arr.filter((f) => f !== fn);
  },
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600 };
  },
};

const mockChart: Record<string, unknown> = {
  subscribeClick: (h: (...a: never[]) => void) => {
    (listeners['click'] ??= new Set()).add(h);
  },
  unsubscribeClick: (h: (...a: never[]) => void) => {
    listeners['click']?.delete(h);
  },
  subscribeCrosshairMove: (h: (...a: never[]) => void) => {
    (listeners['crosshair'] ??= new Set()).add(h);
  },
  unsubscribeCrosshairMove: (h: (...a: never[]) => void) => {
    listeners['crosshair']?.delete(h);
  },
  applyOptions: (opts: unknown) => {
    (mockChart as { lastOptions?: unknown }).lastOptions = opts;
  },
  timeScale: () => mockTimeScale,
  chartElement: () => mockElement,
};

// localStorage 桩（node 无 localStorage）
const memStorage = new Map<string, string>();
(globalThis as unknown as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (memStorage.has(k) ? (memStorage.get(k) as string) : null),
  setItem: (k: string, v: string) => {
    memStorage.set(k, v);
  },
  removeItem: (k: string) => {
    memStorage.delete(k);
  },
  clear: () => memStorage.clear(),
};

// ---------- 测试脚手架 ----------

let store: DrawingStore;
let ctrl: DrawingsController;
let uiEvents: DrawUiEvent[];

function clickParam(time: number, price: number, hoveredId?: string) {
  return {
    time,
    point: { x: xOf(time), y: yOf(price) },
    seriesData: new Map(),
    ...(hoveredId
      ? {
          hoveredInfo: {
            type: 'custom',
            sourceKind: 'series-primitive',
            objectKind: 'primitive',
            objectId: hoveredId,
          },
        }
      : {}),
  };
}

function hoverAt(id: string | null) {
  ctrl.handleCrosshairMove({
    point: { x: 100, y: 400 },
    seriesData: new Map(),
    ...(id
      ? {
          hoveredInfo: {
            type: 'custom',
            sourceKind: 'series-primitive',
            objectKind: 'primitive',
            objectId: id,
          },
        }
      : {}),
  } as never);
}

function makeController(): void {
  store = new DrawingStore();
  uiEvents = [];
  ctrl = new DrawingsController({
    chart: mockChart as never,
    series: mockSeries as never,
    store,
    precision: 2,
    onUi: (ev) => uiEvents.push(ev),
  });
  ctrl.attach();
  ctrl.setStorageKey(storageKey('BTCUSD', '1h'));
}

beforeEach(() => {
  attached.length = 0;
  memStorage.clear();
  mockElement.style = {};
  mockElement.handlers = {};
  for (const k of Object.keys(listeners)) listeners[k].clear();
  makeController();
});

// ---------- 8 种工具创建 ----------

test('trend：两点点击创建', () => {
  ctrl.setTool('trend');
  ctrl.handleClick(clickParam(T0 + 1, 100) as never);
  ctrl.handleClick(clickParam(T0 + 11, 200) as never);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].tool, 'trend');
  assert.equal(list[0].points.length, 2);
  assert.deepEqual(list[0].points[0], { time: T0 + 1, price: 100 });
  assert.deepEqual(list[0].points[1], { time: T0 + 11, price: 200 });
});

test('ray：两点点击创建', () => {
  ctrl.setTool('ray');
  ctrl.handleClick(clickParam(T0 + 2, 150) as never);
  ctrl.handleClick(clickParam(T0 + 8, 180) as never);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].tool, 'ray');
  assert.equal(list[0].points.length, 2);
});

test('fibo：两点点击创建', () => {
  ctrl.setTool('fibo');
  ctrl.handleClick(clickParam(T0 + 3, 90) as never);
  ctrl.handleClick(clickParam(T0 + 30, 190) as never);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].tool, 'fibo');
  assert.equal(list[0].points.length, 2);
});

test('hline：一点完成', () => {
  ctrl.setTool('hline');
  ctrl.handleClick(clickParam(T0 + 5, 120) as never);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].tool, 'hline');
  assert.equal(list[0].points.length, 1);
  assert.equal(list[0].points[0].price, 120);
});

test('rect：两点点击兜底创建（无拖拽）', () => {
  ctrl.setTool('rect');
  ctrl.handleClick(clickParam(T0 + 4, 100) as never);
  assert.equal(store.list().length, 0); // 第一点只挂 preview，不落库
  ctrl.handleClick(clickParam(T0 + 20, 160) as never);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].tool, 'rect');
  assert.equal(list[0].points.length, 2);
});

test('rect：mousedown→mousemove→mouseup 直接拉出', () => {
  ctrl.setTool('rect');
  ctrl.handleMouseDown({ clientX: xOf(T0 + 10), clientY: yOf(125), button: 0 });
  ctrl.handleMouseMove({ x: xOf(T0 + 60), y: yOf(175) });
  ctrl.handleMouseUp();
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].tool, 'rect');
  assert.deepEqual(list[0].points[0], { time: T0 + 10, price: 125 });
  assert.deepEqual(list[0].points[1], { time: T0 + 60, price: 175 });
});

test('channel：三点创建', () => {
  ctrl.setTool('channel');
  ctrl.handleClick(clickParam(T0 + 1, 100) as never);
  ctrl.handleClick(clickParam(T0 + 20, 120) as never);
  assert.equal(store.list().length, 0);
  ctrl.handleClick(clickParam(T0 + 10, 140) as never);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].tool, 'channel');
  assert.equal(list[0].points.length, 3);
});

test('long：三点创建（入场/止损/止盈）', () => {
  ctrl.setTool('long');
  ctrl.handleClick(clickParam(T0 + 1, 100) as never);
  ctrl.handleClick(clickParam(T0 + 1, 95) as never);
  ctrl.handleClick(clickParam(T0 + 1, 110) as never);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].tool, 'long');
  assert.equal(list[0].points.length, 3);
});

test('short：三点创建', () => {
  ctrl.setTool('short');
  ctrl.handleClick(clickParam(T0 + 1, 100) as never);
  ctrl.handleClick(clickParam(T0 + 1, 105) as never);
  ctrl.handleClick(clickParam(T0 + 1, 90) as never);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].tool, 'short');
  assert.equal(list[0].points.length, 3);
});

test('text：点击弹输入框，commitText 后落库', () => {
  ctrl.setTool('text');
  ctrl.handleClick(clickParam(T0 + 7, 130) as never);
  assert.equal(store.list().length, 0); // 点击只弹框，不落库
  assert.equal(uiEvents.length, 1);
  assert.equal(uiEvents[0].type, 'edit-text');
  assert.equal((uiEvents[0] as { id: null }).id, null);
  ctrl.commitText(null, '  看多信号  ');
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].tool, 'text');
  assert.equal(list[0].points.length, 1);
  assert.equal(list[0].style.text, '看多信号');
});

test('画完工具保持激活（TV 手感）', () => {
  ctrl.setTool('trend');
  ctrl.handleClick(clickParam(T0 + 1, 100) as never);
  ctrl.handleClick(clickParam(T0 + 11, 200) as never);
  assert.equal(ctrl.getTool(), 'trend'); // 未退回 select
  ctrl.handleClick(clickParam(T0 + 21, 110) as never);
  ctrl.handleClick(clickParam(T0 + 31, 210) as never);
  assert.equal(store.list().length, 2);
});

// ---------- 选中 / 拖拽 ----------

function makeTrend(): string {
  ctrl.setTool('trend');
  ctrl.handleClick(clickParam(T0 + 1, 100) as never);
  ctrl.handleClick(clickParam(T0 + 11, 200) as never);
  return store.list()[0].id;
}

test('click 选中：hoveredObjectId → selectedId 生效', () => {
  const id = makeTrend();
  hoverAt(id);
  ctrl.handleClick(clickParam(T0 + 6, 150, id) as never);
  assert.equal(store.getSelectedId(), id);
});

test('点空白：select 工具下取消选中', () => {
  const id = makeTrend();
  hoverAt(id);
  ctrl.handleClick(clickParam(T0 + 6, 150, id) as never);
  assert.equal(store.getSelectedId(), id);
  hoverAt(null);
  ctrl.setTool('select');
  ctrl.handleClick(clickParam(T0 + 50, 150) as never);
  assert.equal(store.getSelectedId(), null);
});

test('身体拖：两点整体平移', () => {
  const id = makeTrend();
  hoverAt(id);
  // 中点 (6,400)：距两锚点 (1,600)/(11,200) 都远 → 身体拖
  ctrl.handleMouseDown({ clientX: 6, clientY: 400, button: 0 });
  ctrl.handleMouseMove({ x: 16, y: 390 }); // dt=+10s, dp=+2.5
  ctrl.handleMouseUp();
  const m = store.get(id);
  assert.deepEqual(m?.points, [
    { time: T0 + 11, price: 102.5 },
    { time: T0 + 21, price: 202.5 },
  ]);
});

test('锚点拖：只动该锚点', () => {
  const id = makeTrend();
  hoverAt(id);
  // 锚点1 像素位 (1,600)
  ctrl.handleMouseDown({ clientX: 1, clientY: 600, button: 0 });
  ctrl.handleMouseMove({ x: 21, y: 560 }); // → time T0+21, price 110
  ctrl.handleMouseUp();
  const m = store.get(id);
  assert.deepEqual(m?.points, [
    { time: T0 + 21, price: 110 },
    { time: T0 + 11, price: 200 },
  ]);
});

test('拖拽期间冻结图表滚动/缩放，mouseup 恢复', () => {
  const id = makeTrend();
  hoverAt(id);
  ctrl.handleMouseDown({ clientX: 6, clientY: 400, button: 0 });
  ctrl.handleMouseMove({ x: 16, y: 390 });
  assert.deepEqual((mockChart as { lastOptions?: unknown }).lastOptions, {
    handleScroll: false,
    handleScale: false,
  });
  ctrl.handleMouseUp();
  assert.deepEqual((mockChart as { lastOptions?: unknown }).lastOptions, {
    handleScroll: true,
    handleScale: true,
  });
});

test('拖拽后的 click 被吃掉（不误创建）', () => {
  const id = makeTrend();
  ctrl.setTool('trend'); // 工具保持激活
  hoverAt(id);
  ctrl.handleMouseDown({ clientX: 6, clientY: 400, button: 0 });
  ctrl.handleMouseMove({ x: 16, y: 390 });
  ctrl.handleMouseUp();
  const n = store.list().length;
  ctrl.handleClick(clickParam(T0 + 16, 152.5) as never); // mouseup 后的余波 click
  assert.equal(store.list().length, n);
});

// ---------- 键盘 ----------

test('Delete 删除选中', () => {
  const id = makeTrend();
  hoverAt(id);
  ctrl.handleClick(clickParam(T0 + 6, 150, id) as never);
  assert.equal(store.getSelectedId(), id);
  ctrl.handleKeyDown({ key: 'Delete' });
  assert.equal(store.list().length, 0);
  assert.equal(store.getSelectedId(), null);
});

test('Backspace 同样删除选中', () => {
  makeTrend();
  const id = store.list()[0].id;
  store.select(id);
  ctrl.handleKeyDown({ key: 'Backspace' });
  assert.equal(store.list().length, 0);
});

test('Escape：工具回到 select', () => {
  ctrl.setTool('trend');
  assert.equal(mockElement.style.cursor, 'crosshair');
  ctrl.handleKeyDown({ key: 'Escape' });
  assert.equal(ctrl.getTool(), 'select');
  assert.equal(mockElement.style.cursor, '');
});

test('Escape：创建中先取消创建，不退工具', () => {
  ctrl.setTool('trend');
  ctrl.handleClick(clickParam(T0 + 1, 100) as never);
  ctrl.handleKeyDown({ key: 'Escape' });
  assert.equal(ctrl.getTool(), 'trend');
  assert.equal(store.list().length, 0);
});

// ---------- 双击 / 右键 ----------

test('双击画线 → open-settings 事件', () => {
  const id = makeTrend();
  hoverAt(id);
  ctrl.handleDblClick({ x: 100, y: 400 });
  assert.equal(uiEvents.length, 1);
  assert.equal(uiEvents[0].type, 'open-settings');
  assert.equal((uiEvents[0] as { id: string }).id, id);
});

test('右键画线 → context-menu 事件', () => {
  const id = makeTrend();
  hoverAt(id);
  ctrl.handleContextMenu({ x: 100, y: 400 });
  assert.equal(uiEvents.length, 1);
  assert.equal(uiEvents[0].type, 'context-menu');
  assert.equal((uiEvents[0] as { id: string }).id, id);
});

test('右键空白 → 取消当前工具', () => {
  ctrl.setTool('fibo');
  hoverAt(null);
  ctrl.handleContextMenu({ x: 700, y: 100 });
  assert.equal(ctrl.getTool(), 'select');
  assert.equal(uiEvents.length, 0);
});

// ---------- 持久化 ----------

test('save → DrawingStore.load 回环一致', () => {
  ctrl.setTool('trend');
  ctrl.handleClick(clickParam(T0 + 1, 100) as never);
  ctrl.handleClick(clickParam(T0 + 11, 200) as never);
  ctrl.setTool('hline');
  ctrl.handleClick(clickParam(T0 + 5, 120) as never);
  const key = storageKey('BTCUSD', '1h');
  store.save(key);
  const loaded = DrawingStore.load(key);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].tool, 'trend');
  assert.deepEqual(loaded[0].points, [
    { time: T0 + 1, price: 100 },
    { time: T0 + 11, price: 200 },
  ]);
  assert.equal(loaded[1].tool, 'hline');
  assert.deepEqual(loaded[1].points, [{ time: T0 + 5, price: 120 }]);
});

test('reload：按品种+周期键重建', () => {
  makeTrend();
  const key = storageKey('BTCUSD', '1h');
  store.save(key);
  // 新 controller 模拟切换回来
  const store2 = new DrawingStore();
  const ctrl2 = new DrawingsController({
    chart: mockChart as never,
    series: mockSeries as never,
    store: store2,
    precision: 2,
    onUi: () => {},
  });
  ctrl2.setStorageKey(key);
  ctrl2.reload();
  assert.equal(store2.list().length, 1);
  assert.equal(store2.list()[0].tool, 'trend');
  ctrl2.destroy();
});

// ---------- 样式更新 ----------

test('updateStyle：改颜色落库并同步 primitive', () => {
  const id = makeTrend();
  ctrl.updateStyle(id, { color: '#f23645', lineWidth: 4, dashed: true });
  const m = store.get(id);
  assert.equal(m?.style.color, '#f23645');
  assert.equal(m?.style.lineWidth, 4);
  assert.equal(m?.style.dashed, true);
});
