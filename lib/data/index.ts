// 数据层入口：注册全部适配器（副作用）并 re-export 公共 API
import './adapters';

export * from './registry';
export * from './types';
export { aggregate, chinaTimeToUtcSeconds, cleanBars } from './utils';
export type { Market } from '../symbols';
