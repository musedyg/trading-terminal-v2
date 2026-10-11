// PineTS 引擎单测：纯函数 + 一次真实小脚本运行
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  toKlines,
  computeBacktest,
  toChineseError,
  detectScriptKind,
  pineSourceKey,
  PineTSEngine,
} from '../pinets-engine.ts';
import type { Candle } from '../../data/types.ts';

function mkCandles(n: number, stepSec = 3600): Candle[] {
  const out: Candle[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = p + Math.sin(i / 7) * 2;
    out.push({
      time: 1700000000 + i * stepSec,
      open: o,
      high: Math.max(o, c) + 0.5,
      low: Math.min(o, c) - 0.5,
      close: c,
      volume: 1000,
    });
    p = c;
  }
  return out;
}

test('toKlines: 时间转毫秒、步长取中位数', () => {
  const kl = toKlines(mkCandles(5, 3600));
  assert.equal(kl.length, 5);
  assert.equal(kl[0].openTime, 1700000000 * 1000);
  assert.equal(kl[0].closeTime, 1700000000 * 1000 + 3600 * 1000 - 1);
  assert.equal(kl[4].openTime - kl[3].openTime, 3600000);
});

test('toKlines: 过滤无效 K 线', () => {
  const cs = mkCandles(3);
  cs[1] = { ...cs[1], close: NaN };
  const kl = toKlines(cs);
  assert.equal(kl.length, 2);
});

test('computeBacktest: 汇总指标正确', () => {
  const bt = computeBacktest(
    {
      config: { initial_capital: 10000 },
      netprofit: 500,
      closedtrades: [
        { exit_time: 1700003600000, profit: 300 },
        { exit_time: 1700007200000, profit: -100 },
        { exit_time: 1700010800000, profit: 300 },
      ],
    },
    mkCandles(10, 3600),
  );
  assert.ok(bt);
  assert.equal(bt!.tradeCount, 3);
  assert.equal(bt!.netProfit, 500);
  assert.equal(bt!.totalReturnPct, 5);
  assert.ok(Math.abs(bt!.winRate - (2 / 3) * 100) < 1e-9);
  // 收益曲线：起点 + 3 笔
  assert.equal(bt!.equityCurve.length, 4);
  assert.equal(bt!.equityCurve[0].equity, 10000);
  assert.equal(bt!.equityCurve[3].equity, 10500);
  // 最大回撤：10300→10200 回撤 100
  assert.equal(bt!.maxDrawdown, 100);
});

test('computeBacktest: 空策略返回 undefined', () => {
  assert.equal(computeBacktest(null, []), undefined);
  assert.equal(computeBacktest({} as never, []), undefined);
});

test('toChineseError: v4 提示中文', () => {
  const msg = toChineseError(new Error('Unsupported Pine version: //@version=4 found'));
  assert.ok(msg.includes('v5/v6'));
});

test('toChineseError: 普通错误加中文前缀', () => {
  const msg = toChineseError(new Error('Unexpected token (3:5)'));
  assert.ok(msg.startsWith('Pine 运行出错：'));
});

test('detectScriptKind: 识别 strategy/indicator', () => {
  assert.equal(detectScriptKind(`//@version=5\nstrategy('t')\n`), 'strategy');
  assert.equal(detectScriptKind(`//@version=5\nindicator('t')\n`), 'indicator');
  assert.equal(detectScriptKind(`//@version=5\nplot(close)\n`), 'unknown');
});

test('pineSourceKey: 按品种生成键', () => {
  assert.equal(pineSourceKey('600519'), 'ttv2.pine.v1::600519');
});

test('PineTSEngine: 真实运行 v5 均线脚本', async () => {
  const engine = new PineTSEngine();
  const src = `//@version=5
indicator('SMA test', overlay=true)
s = ta.sma(close, 5)
plot(s, 'SMA5', color=color.blue)
`;
  const res = await engine.run(src, mkCandles(60), { timeframe: '1h' });
  assert.equal(engine.name, 'pinets');
  assert.deepEqual(res.errors, []);
  assert.equal(res.isStrategy, false);
  assert.equal(res.plots.length, 1);
  assert.equal(res.plots[0].name, 'SMA5');
  assert.equal(res.plots[0].overlay, true);
  // 前 4 个点为 null（SMA 预热），第 5 个起有值
  const vals = res.plots[0].points.map((p) => p.value);
  assert.equal(vals.filter((v) => v === null).length, 4);
  assert.ok(vals.slice(4).every((v) => typeof v === 'number'));
});

test('PineTSEngine: v4 脚本被中文拒绝', async () => {
  const engine = new PineTSEngine();
  const res = await engine.run(`//@version=4\nstudy('t')\nplot(close)\n`, mkCandles(20));
  assert.equal(res.plots.length, 0);
  assert.ok(res.errors[0].includes('v5/v6'));
});

test('PineTSEngine: 空脚本中文提示', async () => {
  const engine = new PineTSEngine();
  const res = await engine.run('   ', mkCandles(20));
  assert.ok(res.errors.length > 0);
});
