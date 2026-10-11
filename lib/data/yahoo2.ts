// Yahoo 备用边缘节点适配器（us 备源）
// 说明：原计划用 Stooq（CSV 日线）做美股备源，但 Stooq 在服务端环境被 JS 验证反爬虫墙挡住
// （curl 实测返回浏览器验证页），故改用 Yahoo 备用域名 query2.finance.yahoo.com。
// 注意：这仍是同一家供应商（不同边缘节点），只能防"单域名故障/限频"，不能防"Yahoo 整体挂掉"。
// 抓取逻辑与节流器与主源共用 lib/data/yahoo.ts。
import type { KlineAdapter, Timeframe } from './types';
import { fetchYahooHostKlines } from './yahoo';

const HOST = 'https://query2.finance.yahoo.com';

export const yahoo2Adapter: KlineAdapter = {
  name: 'yahoo2',
  label: 'Yahoo Finance（备用节点）',
  markets: ['us'],
  timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
  fetchKlines: (feed: string, timeframe: Timeframe, limit?: number) =>
    fetchYahooHostKlines(HOST, feed, timeframe, limit),
};
