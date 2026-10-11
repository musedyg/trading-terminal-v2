# trading-terminal-v2 — M1 契约（Contracts）

> 所有代码必须现场原创。严禁读取或复制 `/tmp/alorse-check`（alorse/tradingchart，无 LICENSE，
> package.json 标 private:true）的任何代码。只允许参考本文件描述的架构与接口。

## 1. 数据 API 契约

`GET /api/klines?symbol=<品种id>&timeframe=<tf>`

- `symbol`: 品种 id（见 `lib/symbols.ts`，如 `BTC/USD`、`600519`、`AAPL`）
- `timeframe`: `1m` | `5m` | `15m` | `1h` | `4h` | `1d`（全小写）
- 成功：`{ ok: true, candles: Candle[], symbol, label, timeframe, source, sourceLabel, failover, tried }`
  - `source` = 实际出数据的源，`failover` = 是否发生过切换，`tried` = 尝试过的源（按顺序）
- 失败：`{ ok: false, error: string }`（未知品种/非法周期 400，全部源失败 502）
- `Candle = { time: number /* unix 秒 */, open: number, high: number, low: number, close: number, volume: number }`
- K 线按 time 升序、去重，截断到最近 240 根。路由读取 `searchParams`（dynamic API），在 Next 16 `cacheComponents` 下自动按请求动态渲染（故不使用旧版 `export const dynamic = 'force-dynamic'`，与新版构建不兼容）。
- 上游 fetch 必须带 `AbortSignal.timeout(12000)`。

### 一主一备 failover（`lib/data/registry.ts`）

- 适配器统一接口 `KlineAdapter`（`lib/data/types.ts`）：`{ name, label, markets, timeframes, fetchKlines(feed, timeframe, limit?) }`，返回标准 OHLCV。
- 注册顺序 = 优先级（`lib/data/adapters.ts`）：

| 市场 | 主源 | 备源 |
|---|---|---|
| crypto | Binance（`data-api.binance.vision`，品种最全；`api.binance.com` 地域限制 451） | Kraken → OKX |
| cn | 新浪财经 → 腾讯行情 | 东方财富 push |
| us | Yahoo Finance（请求节流 ≥1.1s，`throttleYahoo`，yahoo2 共用） | Yahoo 备用节点（query2；Stooq 被 JS 验证反爬虫墙挡住，见 `yahoo2.ts` 注释） |

- `fetchKlinesWithFailover(symbol, timeframe)`：按序尝试，跳过"该品种无 feed"或"不支持该周期"的源；主源失败自动切备用；全失败抛聚合错误。
- 新增数据源：新建文件实现 `KlineAdapter`，在 `adapters.ts` 加一行 `registerAdapter`，不动核心逻辑。

### 各源映射（逻辑从用户已验证的 `~/workspace/trading-terminal-standalone/server/` 移植）

| source | 上游 | timeframe 映射 |
|---|---|---|
| binance | `https://data-api.binance.vision/api/v3/klines?symbol={feed}&interval={1m,5m,15m,1h,4h,1d}&limit=`，行 `[ms,o,h,l,c,vol,...]`，`time=floor(ms/1000)` | interval 同 tf 字符串 |
| kraken | `https://api.kraken.com/0/public/OHLC?pair={feed}&interval={1:1m,5:5m,15:15m,60:1h,240:4h,1440:1d}`，行 `[time,o,h,l,c,vwap,volume,count]`，`volume=r[6]`，检查 `error` 非空 | 直接 interval |
| okx | `https://www.okx.com/api/v5/market/candles?instId={feed}&bar={1m,5m,15m,1H,4H,1D}&limit=240`，`code==="0"`，行 `[ms,o,h,l,c,vol,...]`，`time=floor(ms/1000)` | 1h→1H，4h→4H，1d→1D |
| sina | `https://quotes.sina.cn/cn/api/openapi.php/CN_MarketDataService.getKLineData?symbol={feed}&scale={1m:1,5m:5,15m:15,1h:60,4h:60,1d:240}&ma=no&datalen=240`，检查 `result.status.code===0`；`day` 可能是纯日期串 `"2026-10-08"`（当天 00:00 CST）也可能是 `"2026-10-08 10:30:00"`，用 `chinaTimeToUtcSeconds` 解析（CST→UTC）；4h 需把 60m 聚合成 14400s | 见左 |
| tencent | `https://web.ifzq.gtimg.cn/appstock/app/day/query?code={feed}`，每日分时 tick（`"0930 价格 累计成交量 累计成交额"`）聚成 1m K 线（量 = 累计量差值）再聚合到目标周期。**已知限制**：该接口只返回最近约 2 个交易日的 tick（日线约 1–2 根），深历史看新浪/东方财富 | 全周期（tick→聚合） |
| eastmoney | `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={feed}&klt={1m:1,5m:5,15m:15,1h:60,4h:60,1d:101}&fqt=1…`，行 `"日期,开,收,高,低,量(手),额"`，**量×100 换算成股**；4h 聚合 14400s | 见左 |
| yahoo / yahoo2 | `https://query{1,2}.finance.yahoo.com/v8/finance/chart/{sym}?interval={I}&range={R}`，必须带 UA 头 + 节流；映射 `1m:[1m,1d] 5m:[5m,5d] 15m:[15m,1mo] 1h:[1h,3mo] 4h:[1h,3mo]+聚合14400 1d:[1d,1y]`；解析 `timestamp[]` + `indicators.quote[0]` | 见左 |

共享工具（`lib/data/utils.ts`）：`cleanBars`（过滤非 finite/<=0、按 floor(time) 去重、升序、取最近 240）、
`aggregate(rows, seconds)`、`chinaTimeToUtcSeconds`（兼容纯日期串）。

## 2. 品种表（`lib/symbols.ts`）

```ts
export type Market = 'crypto' | 'cn' | 'us';
export type DataSource =
  | 'binance' | 'kraken' | 'okx'
  | 'sina' | 'tencent' | 'eastmoney'
  | 'yahoo' | 'yahoo2';
export interface SymbolInfo {
  id: string; label: string; market: Market; currency: string;
  feeds: Partial<Record<DataSource, string>>; // 各源 feed；failover 跳过缺失的源
}
export const TIMEFRAMES = ['1m','5m','15m','1h','4h','1d'] as const;
export const SYMBOLS: SymbolInfo[] = [
  { id: 'BTC/USD',  label: 'BTC/USD',       market: 'crypto', currency: 'USD',
    feeds: { binance: 'BTCUSDT', kraken: 'XBTUSD', okx: 'BTC-USDT-SWAP' } },
  { id: 'ETH/USD',  label: 'ETH/USD',       market: 'crypto', currency: 'USD',
    feeds: { binance: 'ETHUSDT', kraken: 'ETHUSD', okx: 'ETH-USDT-SWAP' } },
  { id: 'BTC-PERP', label: 'BTC 永续',       market: 'crypto', currency: 'USDT',
    feeds: { okx: 'BTC-USDT-SWAP' } }, // 仅 OKX 有永续，单源
  { id: '600519',   label: '贵州茅台 600519', market: 'cn',   currency: 'CNY',
    feeds: { sina: 'sh600519', tencent: 'sh600519', eastmoney: '1.600519' } },
  { id: '000001',   label: '上证指数 000001', market: 'cn',   currency: 'CNY',
    feeds: { sina: 'sh000001', tencent: 'sh000001', eastmoney: '1.000001' } },
  { id: 'AAPL',     label: 'AAPL 苹果',       market: 'us',   currency: 'USD',
    feeds: { yahoo: 'AAPL', yahoo2: 'AAPL' } },
  { id: 'NVDA',     label: 'NVDA 英伟达',     market: 'us',   currency: 'USD',
    feeds: { yahoo: 'NVDA', yahoo2: 'NVDA' } },
];
```

## 3. 图表组件契约（`components/chart/PriceChart.tsx`）

- Client Component，props: `{ candles: Candle[]; precision: number; symbolLabel: string }`，`Candle` 从 `@/lib/data/types` import。
- `lightweight-charts` v5：`createChart` 深色主题（bg `#131722`，文字 `#d1d4dc`，网格 `rgba(42,46,57,0.5)`），
  蜡烛 `CandlestickSeries`（涨 `#26a69a` / 跌 `#ef5350`，wick 同色），成交量 `HistogramSeries` 用 `priceScaleId: ''`
  叠加到底部（`scaleMargins { top: 0.82, bottom: 0 }`，颜色按涨跌半透明），`priceFormat: { type: 'price', precision, minMove: 10^-precision }`。
- 十字光标默认开启；`ResizeObserver` 自适应；`setData` 更新；卸载时 `chart.remove()`。
- 精度：`lib/format.ts` → `precisionForPrice(p)`：`>=100→2, >=10→3, >=1→4, >=0.1→5, >=0.01→6, else→8`。

## 4. M2/M3 扩展点（M1 只留插槽，不实现）

- `components/chart/PriceChart.tsx` 内以注释标记：`/* M2: drawings layer slot */`（画线层）、
  `/* M3: indicator panes slot */`（指标窗格）、`/* M3: multi-chart grid slot */`（多图网格）。
- `lib/chart/extensions.ts`：导出空壳 `DrawingsLayer` / `IndicatorPanes` / `MultiChartGrid`（render null + TODO 注释）。
- `lib/pine/engine.ts`：Pine 引擎接口（M3 接 PineTS，npm `pinets`，AGPL-3.0）：
  ```ts
  export interface PinePlotPoint { time: number; value: number | null }
  export interface PineResult { plots: Record<string, PinePlotPoint[]>; errors: string[] }
  export interface PineEngine { readonly name: string; run(source: string, candles: Candle[]): Promise<PineResult> }
  export class NoopPineEngine implements PineEngine { readonly name = 'noop'; async run() { return { plots: {}, errors: ['M3: PineTS engine not wired yet'] }; } }
  ```
  M1 不安装 `pinets`。

## 5. 品牌与授权

- 页面 footer 必须包含：`Charting by TradingView Lightweight Charts™ (Apache-2.0)` 署名 + 数据源说明。
- 除此之外不得出现 TradingView 品牌露出。
- 项目整体 AGPL-3.0（PineTS 要求，M3 生效），README 注明。

## 6. M3 阶段 C：预警 / 模拟交易 / TP-SL-挂单线

- `lib/alerts/`：预警模型与存储。
  - `AlertModel { id, symbolId, symbolLabel, direction: 'above'|'below', price, createdAt, triggeredAt }`；
    `triggeredAt: null` = 监控中，否则为触发时间戳（只触发一次）。
  - 存储键 `ttv2.alerts.v1`（全局，预警自带 symbolId）。
  - 触发检查：父组件每 2 秒用**活动窗格**最新收盘价检查（`isAlertTriggered` 纯函数）；
    触发时页面顶部中文横幅 + WebAudio 合成提示音（`lib/alerts/sound.ts`，无外部音频文件）。
- `components/trade/TradePanel.tsx`：浮动模拟交易窗（可拖拽头、买入/卖出、数量输入）。
  纯模拟：不接任何真实交易接口，订单只记本地内存日志并明确标注"模拟"。
- `lib/tradelines/` + `components/chart/TradeLinesLayer.tsx`：可拖拽 TP/SL/挂单线。
  - `TradeLineModel { id, kind: 'tp'|'sl'|'order', price }`；TP 绿 / SL 红 / 挂单蓝虚线；
    存储键 `ttv2.tradelines.v1::<paneId>::<symbolId>::<timeframe>`（与画线同规则隔离）。
  - `TradeLinePrimitive` 为 Series Primitive：全宽水平线 + 右侧价格标签；
    `autoscaleInfo()`/`hitTest()` 恒返回 null（不参与缩放、不干扰 M2 画线控制器）。
  - 拖拽命中由本层用 `series.priceToCoordinate` 距离（8px）判定；拖拽期间冻结图表滚动缩放；
    双击删除；右上角控制条增删（TP/SL/挂单各自独立、数量不限）。
  - 挂载于 `PriceChart` 的 DrawingsLayer 之后（同条件），每个窗格独立实例。
