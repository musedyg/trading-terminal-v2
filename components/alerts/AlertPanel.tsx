'use client';

// 价格预警面板（M3 阶段 C）：添加上破/下破预警、列表增删、触发状态展示。
// 纯展示组件：数据与触发检查由父组件（app/page.tsx）负责。

import { useState } from 'react';
import type { AlertDirection, AlertModel } from '@/lib/alerts/types';
import { strings } from '@/lib/i18n';

export interface AlertPanelProps {
  alerts: AlertModel[];
  /** 当前活动品种的最新价（用于默认填充与参考显示） */
  currentPrice: number | null;
  symbolLabel: string;
  symbolId: string;
  precision: number;
  onAdd: (direction: AlertDirection, price: number) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export default function AlertPanel({
  alerts,
  currentPrice,
  symbolLabel,
  symbolId,
  precision,
  onAdd,
  onRemove,
  onClose,
}: AlertPanelProps) {
  const [direction, setDirection] = useState<AlertDirection>('above');
  const [priceText, setPriceText] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const price = Number(priceText);
    if (!Number.isFinite(price) || price <= 0) {
      setError(strings.alertInvalidPrice);
      return;
    }
    setError('');
    onAdd(direction, price);
    setPriceText('');
  };

  const active = alerts.filter((a) => a.triggeredAt === null);
  const done = alerts.filter((a) => a.triggeredAt !== null);

  return (
    <div className="fixed top-14 right-3 z-50 w-80 rounded-md border border-[#2a2e39] bg-[#1e222d] shadow-2xl">
      {/* 头 */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-[#2a2e39]">
        <span className="text-sm font-medium text-[#d1d4dc]">{strings.alertTitle}</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
        >
          ✕
        </button>
      </div>

      {/* 添加表单 */}
      <div className="p-3 border-b border-[#2a2e39]">
        <div className="text-xs text-[#787b86] mb-1.5">
          {symbolLabel}
          {currentPrice !== null && (
            <span className="ml-2 text-[#d1d4dc]">
              {strings.alertCurrentPrice} {currentPrice.toFixed(precision)}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <div className="flex rounded overflow-hidden border border-[#2a2e39]">
            {(['above', 'below'] as AlertDirection[]).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={`h-8 px-3 text-sm ${
                  direction === d ? 'bg-[#2962ff] text-white' : 'bg-[#131722] text-[#b2b5be] hover:bg-[#2a2e39]'
                }`}
              >
                {d === 'above' ? strings.alertAbove : strings.alertBelow}
              </button>
            ))}
          </div>
          <input
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              e.stopPropagation();
            }}
            placeholder={strings.alertPricePlaceholder}
            inputMode="decimal"
            className="flex-1 min-w-0 h-8 px-2 rounded bg-[#131722] border border-[#2a2e39] text-sm text-[#d1d4dc] outline-none focus:border-[#2962ff]"
          />
          <button
            onClick={submit}
            className="h-8 px-3 rounded text-sm bg-[#2962ff] text-white hover:bg-[#1e53e5] shrink-0"
          >
            {strings.alertAdd}
          </button>
        </div>
        {error && <div className="mt-1.5 text-xs text-[#f23645]">{error}</div>}
      </div>

      {/* 列表 */}
      <div className="max-h-72 overflow-y-auto">
        {alerts.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-[#787b86]">{strings.alertEmpty}</div>
        )}
        {active.length > 0 && (
          <div className="px-3 pt-2 pb-1 text-xs text-[#787b86]">{strings.alertWatching}</div>
        )}
        {active.map((a) => (
          <AlertRow key={a.id} alert={a} precision={precision} onRemove={onRemove} />
        ))}
        {done.length > 0 && (
          <div className="px-3 pt-2 pb-1 text-xs text-[#787b86]">{strings.alertDone}</div>
        )}
        {done.map((a) => (
          <AlertRow key={a.id} alert={a} precision={precision} onRemove={onRemove} />
        ))}
      </div>
      {/* 仅显示当前活动品种的提示 */}
      <div className="px-3 py-2 border-t border-[#2a2e39] text-[11px] text-[#787b86]">
        {strings.alertScopeHint}
      </div>
    </div>
  );
}

function AlertRow({
  alert,
  precision,
  onRemove,
}: {
  alert: AlertModel;
  precision: number;
  onRemove: (id: string) => void;
}) {
  const triggered = alert.triggeredAt !== null;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#2a2e39]/50">
      <span
        className={`text-xs px-1.5 py-0.5 rounded ${
          alert.direction === 'above' ? 'bg-[#26a69a]/15 text-[#26a69a]' : 'bg-[#ef5350]/15 text-[#ef5350]'
        }`}
      >
        {alert.direction === 'above' ? strings.alertAbove : strings.alertBelow}
      </span>
      <span className="text-sm text-[#d1d4dc]">{alert.price.toFixed(precision)}</span>
      <span className="text-xs text-[#787b86] truncate">{alert.symbolLabel}</span>
      <div className="flex-1" />
      {triggered && (
        <span className="text-[11px] text-[#f0b90b]">{strings.alertTriggered}</span>
      )}
      <button
        onClick={() => onRemove(alert.id)}
        title={strings.drawingDelete}
        className="w-6 h-6 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#f23645] text-xs"
      >
        ✕
      </button>
    </div>
  );
}
