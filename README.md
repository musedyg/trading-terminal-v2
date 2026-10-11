# Trading Terminal V2（合并版）— M1 地基

干净重写的交易终端地基（Next.js 16 + React 19 + TypeScript + Tailwind v4 + Lightweight Charts v5）。
M1 范围：能跑、能看 K 线、能切品种/周期。画线工具、Pine、回测、分屏、预警、交易窗留到 M2/M3（扩展点已预留）。

## 授权

- **本项目整体 AGPL-3.0**（为 M3 接入 PineTS 预留，PineTS 为 AGPL-3.0，见 `lib/pine/engine.ts`）。
- 图表库 `lightweight-charts` 为 **Apache-2.0**，页面 footer 保留 TradingView 署名（Apache-2.0 §4 要求）。
- Clean-room：本工程所有代码均为现场原创，未复制任何第三方仓库代码。

## 本地运行

```bash
cd trading-terminal-v2
npm install
npm run dev
# 打开 http://localhost:3000
```

构建验证：`npm run build` / `npx tsc --noEmit`（M1 交付时两者皆通过）。

## 目录结构

```
app/
  page.tsx            顶栏（品种搜索/周期切换/指标占位）+ 左侧工具栏占位 + 主图 + footer
  layout.tsx          title=Trading Terminal V2，深色
  globals.css         深色主题
  api/klines/route.ts GET /api/klines?symbol=<品种id>&timeframe= → 统一 OHLCV + failover（unix 秒）
components/chart/
  PriceChart.tsx      蜡烛图 + 成交量（Lightweight Charts v5），深色 TV 配色，十字光标，精度自适应
lib/
  symbols.ts          品种表（7 个品种，各源 feed 映射）+ SOURCE_LABELS
  format.ts           precisionForPrice（2–8 位自适应）
  i18n.ts             界面文案（默认简体中文，预留英文扩展）
  data/               数据层：registry.ts（一主一备）/ adapters.ts（注册）/ types.ts（KlineAdapter 接口）
                      binance.ts kraken.ts okx.ts sina.ts tencent.ts eastmoney.ts yahoo.ts yahoo2.ts
                      utils.ts（cleanBars/aggregate/chinaTimeToUtcSeconds）/ index.ts
  chart/extensions.ts M2/M3 插槽空壳：DrawingsLayer / IndicatorPanes / MultiChartGrid
  pine/engine.ts      Pine 引擎接口（M3 接 PineTS）：PineEngine / PineResult / NoopPineEngine
CONTRACTS.md          接口契约（数据 API、品种表、图表、扩展点）
```

## 数据 API（一主一备自动 failover）

`GET /api/klines?symbol=<品种id>&timeframe=1m|5m|15m|1h|4h|1d`

- 成功 `{ ok: true, candles: [{time,open,high,low,close,volume}], symbol, label, timeframe, source, sourceLabel, failover, tried }`
  - `source` = 实际出数据的源；`failover` 为 true 表示发生过切换；`tried` 为尝试过的源
- 失败 `{ ok: false, error }`（未知品种/非法周期 400 / 全部源失败 502）
- 服务端 route handler 拉取上游（避开浏览器 CORS），12s 超时；Next 16 `cacheComponents` 下靠读取 `searchParams` 自动动态渲染。

| 市场 | 主源 | 备源 |
|---|---|---|
| 加密货币 | Binance（公开行情域名） | Kraken → OKX |
| A股 | 新浪财经 → 腾讯行情 | 东方财富 |
| 美股 | Yahoo Finance（请求节流 ≥1.1s） | Yahoo 备用节点 |

适配器统一接口 `KlineAdapter`（`lib/data/types.ts`），注册在 `lib/data/adapters.ts`。
**新增数据源**：在 `lib/data/` 新建文件实现 `KlineAdapter`，在 `adapters.ts` 加一行 `registerAdapter` 即可，不动核心逻辑。

注意：
- 新浪日 K 的 `day` 字段是纯日期串（无时间部分），按当天 00:00 CST 解析（`chinaTimeToUtcSeconds`，`lib/data/utils.ts`）。
- 东方财富返回量单位是"手"，已 ×100 换算成股。
- `api.binance.com` 有地域限制，默认走 `data-api.binance.vision`。
- Stooq 被 JS 验证反爬虫墙挡住，不可用；美股备源为 Yahoo 备用域名（同一供应商，仅防单域名故障）。

## 界面语言

默认简体中文。文案集中在 `lib/i18n.ts`（`zh` 字典），以后扩展英文只需加 `en` 字典并接语言切换器；M1 不做切换器。

## M2/M3 扩展点

- `PriceChart.tsx` 内注释标记：`M2: drawings layer slot`（画线层）、`M3: indicator panes slot`（指标窗格）、`M3: multi-chart grid slot`（多图网格）。
- `lib/chart/extensions.ts`：三个空壳组件，M2/M3 填充实现。
- `lib/pine/engine.ts`：实现 `PineEngine` 接口即可接入（M3 计划用 npm `pinets`，Node/浏览器两栖，v5/v6）。M1 未安装 pinets。
