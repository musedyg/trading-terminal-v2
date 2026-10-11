'use client';

// 浮动模拟交易窗（M3 阶段 C）：可拖拽小面板，买入/卖出 + 数量输入。
// 纯模拟：不接任何真实交易接口，下单只记本地日志并明确标注"模拟"。

import { useRef, useState } from 'react';
import { strings } from '@/lib/i18n';

export interface TradePanelProps {
  symbolLabel: string;
  /** 最新价（null = 暂无） */
  price: number | null;
  precision: number;
  onClose: () => void;
}

interface SimOrder {
  id: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  time: string;
}

export default function TradePanel({ symbolLabel, price, precision, onClose }: TradePanelProps) {
  const [qtyText, setQtyText] = useState('0.01');
  const [orders, setOrders] = useState<SimOrder[]>([]);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [placed, setPlaced] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const onHeaderDown = (e: React.MouseEvent) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setPos({ x: d.ox + ev.clientX - d.sx, y: d.oy + ev.clientY - d.sy });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const place = (side: 'buy' | 'sell') => {
    const qty = Number(qtyText);
    if (!Number.isFinite(qty) || qty <= 0 || price === null) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setOrders((prev) =>
      [{ id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`, side, qty, price, time }, ...prev].slice(0, 20),
    );
    setPlaced(true);
    window.setTimeout(() => setPlaced(false), 2500);
  };

  const qty = Number(qtyText);
  const qtyValid = Number.isFinite(qty) && qty > 0;

  return (
    <div
      className="fixed z-50 w-72 rounded-md border border-[#2a2e39] bg-[#1e222d] shadow-2xl select-none"
      style={{ top: `calc(3.5rem + ${pos.y}px)`, right: `calc(0.75rem - ${pos.x}px)` }}
    >
      {/* 可拖拽头 */}
      <div
        onMouseDown={onHeaderDown}
        className="flex items-center justify-between px-3 h-10 border-b border-[#2a2e39] cursor-move"
      >
        <span className="text-sm font-medium text-[#d1d4dc]">{strings.tradeTitle}</span>
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-6 h-6 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
        >
          ✕
        </button>
      </div>

      <div className="p-3">
        {/* 品种 + 最新价 */}
        <div className="flex items-baseline justify-between mb-2.5">
          <span className="text-sm font-semibold text-[#d1d4dc]">{symbolLabel}</span>
          <span className="text-sm text-[#787b86]">
            {price !== null ? price.toFixed(precision) : '—'}
          </span>
        </div>

        {/* 数量 */}
        <div className="text-xs text-[#787b86] mb-1.5">{strings.tradeQty}</div>
        <input
          value={qtyText}
          onChange={(e) => setQtyText(e.target.value)}
          inputMode="decimal"
          className="w-full h-9 px-2 mb-2.5 rounded bg-[#131722] border border-[#2a2e39] text-sm text-[#d1d4dc] outline-none focus:border-[#2962ff]"
        />

        {/* 买入 / 卖出 */}
        <div className="flex gap-2">
          <button
            onClick={() => place('buy')}
            disabled={!qtyValid || price === null}
            className="flex-1 h-10 rounded text-sm font-medium bg-[#26a69a] text-white hover:bg-[#1f887e] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {strings.tradeBuy}
          </button>
          <button
            onClick={() => place('sell')}
            disabled={!qtyValid || price === null}
            className="flex-1 h-10 rounded text-sm font-medium bg-[#ef5350] text-white hover:bg-[#d43a37] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {strings.tradeSell}
          </button>
        </div>

        {placed && (
          <div className="mt-2 text-xs text-[#26a69a]">{strings.tradePlaced}</div>
        )}
        <div className="mt-2 text-[11px] text-[#787b86]">{strings.tradeSimNote}</div>

        {/* 模拟订单记录 */}
        {orders.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-[#787b86] mb-1.5">{strings.tradeOrderLog}</div>
            <div className="max-h-36 overflow-y-auto flex flex-col gap-1">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-[#131722]"
                >
                  <span className={o.side === 'buy' ? 'text-[#26a69a]' : 'text-[#ef5350]'}>
                    {o.side === 'buy' ? strings.tradeBuy : strings.tradeSell}
                  </span>
                  <span className="text-[#d1d4dc]">{o.qty}</span>
                  <span className="text-[#787b86]">@</span>
                  <span className="text-[#d1d4dc]">{o.price.toFixed(precision)}</span>
                  <div className="flex-1" />
                  <span className="text-[#787b86]">{o.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
