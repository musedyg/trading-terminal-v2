// 数据 API 路由 — 来源：CONTRACTS.md 第 1 节
// GET /api/klines?symbol=<品种id>&timeframe=<1m|5m|15m|1h|4h|1d>
// 按品种查注册表做一主一备自动 failover，返回实际出数据的源。
// Next 16（cacheComponents）下不使用 `export const dynamic = 'force-dynamic'`（构建不兼容）；
// 本 handler 读取了 req.nextUrl.searchParams（dynamic API），自动按请求动态渲染。

import { NextRequest, NextResponse } from 'next/server';
import { SOURCE_LABELS, SYMBOLS, TIMEFRAMES } from '@/lib/symbols';
import { fetchKlinesWithFailover } from '@/lib/data';
import type { Timeframe } from '@/lib/data/types';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const symbolId = q.get('symbol') ?? '';
  const timeframe = q.get('timeframe') ?? '';

  const symbol = SYMBOLS.find((s) => s.id === symbolId);
  if (!symbol) {
    return NextResponse.json({ ok: false, error: `未知品种: ${symbolId || '（空）'}` }, { status: 400 });
  }
  if (!(TIMEFRAMES as readonly string[]).includes(timeframe)) {
    return NextResponse.json({ ok: false, error: `周期非法: ${timeframe || '（空）'}` }, { status: 400 });
  }

  try {
    const result = await fetchKlinesWithFailover(symbol, timeframe as Timeframe);
    return NextResponse.json({
      ok: true,
      candles: result.candles,
      symbol: symbol.id,
      label: symbol.label,
      timeframe,
      source: result.source,
      sourceLabel: SOURCE_LABELS[result.source],
      failover: result.tried.length > 1, // 是否发生过切换
      tried: result.tried,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
