// 适配器注册中心：新增数据源只需在这里加一行 registerAdapter，不动核心逻辑。
// 顺序 = 优先级：主源在前，备源在后。
import { registerAdapter } from './registry';
import { binanceAdapter } from './binance';
import { krakenAdapter } from './kraken';
import { okxAdapter } from './okx';
import { sinaAdapter } from './sina';
import { tencentAdapter } from './tencent';
import { eastmoneyAdapter } from './eastmoney';
import { yahooAdapter } from './yahoo';
import { yahoo2Adapter } from './yahoo2';

// Crypto：一主（Binance，品种最全）两备（Kraken、OKX）
registerAdapter('crypto', binanceAdapter, { primary: true });
registerAdapter('crypto', krakenAdapter);
registerAdapter('crypto', okxAdapter);

// A股：主（新浪）→ 第二顺位（腾讯）→ 备（东方财富）
registerAdapter('cn', sinaAdapter, { primary: true });
registerAdapter('cn', tencentAdapter);
registerAdapter('cn', eastmoneyAdapter);

// 美股：主（Yahoo Finance，带请求节流），备（Yahoo 备用边缘节点）
// Stooq 因反爬虫墙不可用，见 yahoo2.ts 注释。
registerAdapter('us', yahooAdapter, { primary: true });
registerAdapter('us', yahoo2Adapter);
