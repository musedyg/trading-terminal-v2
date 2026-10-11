# 部署说明（Render 免费版）

## 方式一：Blueprint（一键，推荐）
1. 把本项目推送到 GitHub（仓库设为公开或私有均可）。
2. 登录 Render → "New +" → "Blueprint" → 选择该仓库。
3. Render 会读取 `render.yaml` 自动创建 Web Service，直接 Deploy。
4. 部署完成后得到公网地址（如 `https://trading-terminal-v2.onrender.com`）。

## 方式二：手动建 Web Service
- Build Command：`npm install && npm run build`
- Start Command：`npm start`
- 环境变量：`NODE_VERSION=20.18.0`
- 免费版 15 分钟无访问会休眠，首次打开慢是正常的；可用 UptimeRobot 做保活。

## 本地运行
```bash
npm install
npm run dev      # 开发模式 http://localhost:3000
npm run build && npm start  # 生产模式
```

## 说明
- 数据走服务端 API Route（`/api/klines`），浏览器无跨域问题。
- PineTS（AGPL-3.0）已内置默认开启；本项目整体按 AGPL-3.0 开源。
- 图表库为 TradingView Lightweight Charts™（Apache-2.0），页面保留署名。
