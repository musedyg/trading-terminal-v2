// 品种解析单测：预设命中、动态代码构造（输代码直查）、搜索输入归一化
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDynamicSymbol, normalizeSymbolInput, resolveSymbol } from '../symbols.ts';

test('预设品种优先命中（BTC/USD 用 XBTUSD 而非动态拼的 BTCUSD）', () => {
  const btc = resolveSymbol('BTC/USD');
  assert.equal(btc?.feeds.kraken, 'XBTUSD');
  const perp = resolveSymbol('BTC-PERP');
  assert.deepEqual(perp?.feeds, { okx: 'BTC-USDT-SWAP' });
});

test('扩充预设：SOL/WLD 加密、比亚迪、TSLA 都在表中且 feed 齐全', () => {
  const sol = resolveSymbol('SOL/USD');
  assert.equal(sol?.feeds.binance, 'SOLUSDT');
  assert.equal(sol?.feeds.okx, 'SOL-USDT-SWAP');
  const byd = resolveSymbol('002594');
  assert.equal(byd?.label, '比亚迪 002594');
  assert.equal(byd?.feeds.sina, 'sz002594');
  const tsla = resolveSymbol('TSLA');
  assert.equal(tsla?.feeds.yahoo, 'TSLA');
});

test('动态 A股：6 位数字按首位分市场', () => {
  assert.equal(buildDynamicSymbol('600519')?.feeds.sina, 'sh600519');
  assert.equal(buildDynamicSymbol('000001')?.feeds.sina, 'sz000001');
  assert.equal(buildDynamicSymbol('300750')?.feeds.eastmoney, '0.300750');
  assert.equal(buildDynamicSymbol('830799')?.feeds.sina, 'bj830799');
});

test('动态加密：多种写法都归一到 BASE/USD 并配三源', () => {
  for (const raw of ['PEPE', 'PEPE/USD', 'PEPE/USDT', 'PEPEUSDT', 'pepe']) {
    const s = buildDynamicSymbol(raw);
    assert.equal(s?.id, 'PEPE/USD', raw);
    assert.equal(s?.feeds.binance, 'PEPEUSDT');
    assert.equal(s?.feeds.okx, 'PEPE-USDT-SWAP');
  }
  const perp = buildDynamicSymbol('ETH-PERP');
  assert.deepEqual(perp?.feeds, { okx: 'ETH-USDT-SWAP' });
});

test('动态美股：字母代码走 Yahoo，BRK.B 转 BRK-B', () => {
  assert.equal(buildDynamicSymbol('NFLX')?.feeds.yahoo, 'NFLX');
  const brk = buildDynamicSymbol('BRK.B');
  assert.equal(brk?.id, 'BRK.B');
  assert.equal(brk?.feeds.yahoo, 'BRK-B');
});

test('动态品种解析结果引用稳定（同一 id 两次解析必须是同一对象）', () => {
  // 回归：ChartPane 的加载回调依赖 symbol 身份，动态对象每次新建会造成请求死循环
  assert.equal(resolveSymbol('PEPE/USD'), resolveSymbol('PEPE/USD'));
  assert.equal(resolveSymbol('NFLX'), resolveSymbol('NFLX'));
});

test('识别不了的输入返回 undefined / null', () => {
  assert.equal(buildDynamicSymbol(''), undefined);
  assert.equal(buildDynamicSymbol('贵州茅台'), undefined);
  assert.equal(buildDynamicSymbol('12345'), undefined);
  assert.equal(normalizeSymbolInput(''), null);
  assert.equal(normalizeSymbolInput('sol'), 'SOL/USD');
  assert.equal(normalizeSymbolInput(' 002594 '), '002594');
});
