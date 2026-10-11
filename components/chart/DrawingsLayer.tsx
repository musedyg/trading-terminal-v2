'use client';

// 画线层（M2）：DrawingsController 的 React 接线 + 三块中文 UI
// （设置弹窗 / 右键菜单 / 文字输入框）。覆盖在 PriceChart 上，不拦截图表交互。

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { DrawingsController, type DrawUiEvent } from '@/lib/drawings/controller';
import { DrawingStore } from '@/lib/drawings/store';
import { storageKey, legacyStorageKey, type DrawingStyle, type ToolType } from '@/lib/drawings/types';
import { strings } from '@/lib/i18n';

export interface DrawingsLayerProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  activeTool: ToolType;
  symbolId: string;
  timeframe: string;
  precision: number;
  /** M3 阶段 A：窗格 id，画线按窗格隔离（默认 'pane-0' 兼容旧调用） */
  paneId?: string;
}

type UiOverlay =
  | { kind: 'settings'; id: string; x: number; y: number }
  | { kind: 'menu'; id: string | null; x: number; y: number }
  | { kind: 'text'; id: string | null; x: number; y: number };

const SWATCHES = [
  '#2962ff',
  '#f23645',
  '#ff9800',
  '#4caf50',
  '#9c27b0',
  '#787b86',
  '#d1d4dc',
  '#ffffff',
] as const;

const LINE_WIDTHS = [1, 2, 3, 4] as const;
const FONT_SIZES = [10, 12, 13, 14, 16, 20] as const;

/** 把 controller 给的 x/y 钳制在容器内（popup 宽按 240px 估） */
function clampPos(x: number, y: number): { left: string; top: string } {
  return {
    left: `max(4px, min(${Math.round(x)}px, calc(100% - 248px)))`,
    top: `max(4px, min(${Math.round(y)}px, calc(100% - 220px)))`,
  };
}

export default function DrawingsLayer({
  chart,
  series,
  activeTool,
  symbolId,
  timeframe,
  precision,
  paneId = 'pane-0',
}: DrawingsLayerProps) {
  const keyFor = (s: string, t: string) => storageKey(s, t, paneId);
  const ctrlRef = useRef<DrawingsController | null>(null);
  const storeRef = useRef<DrawingStore | null>(null);
  const [overlay, setOverlay] = useState<UiOverlay | null>(null);
  // store 变更时刷新弹窗内容（选中态/拖拽后的样式回读）
  const [, setVersion] = useState(0);

  // 创建 controller（chart/series 就绪后一次）
  useEffect(() => {
    const store = new DrawingStore();
    const ctrl = new DrawingsController({
      chart,
      series,
      store,
      precision,
      onUi: (ev: DrawUiEvent) => {
        if (ev.type === 'edit-text') {
          setOverlay({ kind: 'text', id: ev.id, x: ev.x, y: ev.y });
        } else if (ev.type === 'open-settings') {
          setOverlay({ kind: 'settings', id: ev.id, x: ev.x, y: ev.y });
        } else {
          setOverlay({ kind: 'menu', id: ev.id, x: ev.x, y: ev.y });
        }
      },
    });
    storeRef.current = store;
    ctrlRef.current = ctrl;
    ctrl.attach();
    ctrl.setStorageKey(keyFor(symbolId, timeframe), legacyStorageKey(symbolId, timeframe));
    ctrl.setTool(activeTool);
    ctrl.reload();
    const unsub = store.subscribe(() => {
      setVersion((v) => v + 1);
    });
    return () => {
      unsub();
      ctrl.destroy();
      ctrlRef.current = null;
      storeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series]);

  // 品种/周期/窗格切换：重载该键下的画线
  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    ctrl.setStorageKey(keyFor(symbolId, timeframe), legacyStorageKey(symbolId, timeframe));
    ctrl.reload();
    setOverlay(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolId, timeframe, paneId]);

  // 工具栏切换
  useEffect(() => {
    ctrlRef.current?.setTool(activeTool);
    setOverlay((o) => (o && o.kind === 'menu' ? null : o));
  }, [activeTool]);

  // 精度变化
  useEffect(() => {
    ctrlRef.current?.setPrecision(precision);
  }, [precision]);

  const store = storeRef.current;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none">
      {overlay?.kind === 'settings' && store && (
        <SettingsPopup
          key={overlay.id}
          store={store}
          ctrl={ctrlRef.current}
          id={overlay.id}
          x={overlay.x}
          y={overlay.y}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'menu' && (
        <ContextMenu
          x={overlay.x}
          y={overlay.y}
          onSettings={() =>
            setOverlay(
              overlay.id ? { kind: 'settings', id: overlay.id, x: overlay.x, y: overlay.y } : null,
            )
          }
          onDelete={() => {
            const id = overlay.id;
            if (id) {
              const st = storeRef.current;
              const cur = st?.getSelectedId();
              if (cur !== id) st?.select(id);
              ctrlRef.current?.deleteSelected();
            }
            setOverlay(null);
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'text' && store && (
        <TextInput
          key={overlay.id ?? 'new'}
          store={store}
          id={overlay.id}
          x={overlay.x}
          y={overlay.y}
          onCommit={(text) => {
            ctrlRef.current?.commitText(overlay.id, text);
            setOverlay(null);
          }}
          onCancel={() => setOverlay(null)}
        />
      )}
    </div>
  );
}

// ---------- 设置弹窗（TV 风格） ----------

function SettingsPopup({
  store,
  ctrl,
  id,
  x,
  y,
  onClose,
}: {
  store: DrawingStore;
  ctrl: DrawingsController | null;
  id: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const model = store.get(id);
  if (!model) return null;
  const style = model.style;
  const isText = model.tool === 'text';
  const hideLineStyle = model.tool === 'fibo' || isText;
  const pos = clampPos(x, y);

  const set = (patch: Partial<DrawingStyle>) => {
    ctrl?.updateStyle(id, patch);
  };

  return (
    <div
      className="absolute pointer-events-auto w-60 rounded-md border border-[#2a2e39] bg-[#1e222d] shadow-xl p-3"
      style={pos}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[#d1d4dc]">{strings.drawingSettings}</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
        >
          ✕
        </button>
      </div>

      {/* 颜色 */}
      <div className="mb-2.5">
        <div className="text-xs text-[#787b86] mb-1.5">{strings.drawingColor}</div>
        <div className="flex gap-1.5 flex-wrap">
          {SWATCHES.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => set({ color: c })}
              className={`w-6 h-6 rounded-full border-2 ${
                style.color.toLowerCase() === c ? 'border-white' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* 线宽 */}
      <div className="mb-2.5">
        <div className="text-xs text-[#787b86] mb-1.5">{strings.drawingLineWidth}</div>
        <div className="flex gap-1">
          {LINE_WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => set({ lineWidth: w })}
              className={`h-7 px-3 rounded text-sm ${
                style.lineWidth === w
                  ? 'bg-[#2962ff] text-white'
                  : 'bg-[#2a2e39] text-[#b2b5be] hover:bg-[#363c4e]'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* 线型 */}
      {!hideLineStyle && (
        <div className="mb-2.5">
          <div className="text-xs text-[#787b86] mb-1.5">{strings.drawingLineStyle}</div>
          <div className="flex gap-1">
            <button
              onClick={() => set({ dashed: false })}
              className={`h-7 px-3 rounded text-sm ${
                !style.dashed
                  ? 'bg-[#2962ff] text-white'
                  : 'bg-[#2a2e39] text-[#b2b5be] hover:bg-[#363c4e]'
              }`}
            >
              {strings.drawingSolid}
            </button>
            <button
              onClick={() => set({ dashed: true })}
              className={`h-7 px-3 rounded text-sm ${
                style.dashed
                  ? 'bg-[#2962ff] text-white'
                  : 'bg-[#2a2e39] text-[#b2b5be] hover:bg-[#363c4e]'
              }`}
            >
              {strings.drawingDashed}
            </button>
          </div>
        </div>
      )}

      {/* 文字工具：文本 + 字号 */}
      {isText && (
        <div className="mb-2.5">
          <div className="text-xs text-[#787b86] mb-1.5">{strings.drawingTextContent}</div>
          <input
            defaultValue={style.text ?? ''}
            placeholder={strings.drawingTextPlaceholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                set({ text: (e.target as HTMLInputElement).value });
              }
              e.stopPropagation();
            }}
            onBlur={(e) => set({ text: e.target.value })}
            className="w-full h-8 px-2 rounded bg-[#131722] border border-[#2a2e39] text-sm text-[#d1d4dc] outline-none focus:border-[#2962ff]"
          />
          <div className="text-xs text-[#787b86] mt-2 mb-1.5">{strings.drawingFontSize}</div>
          <div className="flex gap-1 flex-wrap">
            {FONT_SIZES.map((fs) => (
              <button
                key={fs}
                onClick={() => set({ fontSize: fs })}
                className={`h-7 px-2.5 rounded text-sm ${
                  (style.fontSize ?? 13) === fs
                    ? 'bg-[#2962ff] text-white'
                    : 'bg-[#2a2e39] text-[#b2b5be] hover:bg-[#363c4e]'
                }`}
              >
                {fs}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- 右键菜单 ----------

function ContextMenu({
  x,
  y,
  onSettings,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  onSettings: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const pos = clampPos(x, y);
  return (
    <>
      <div className="absolute inset-0 pointer-events-auto" onMouseDown={onClose} />
      <div
        className="absolute pointer-events-auto w-32 rounded-md border border-[#2a2e39] bg-[#1e222d] shadow-xl py-1"
        style={pos}
      >
        <button
          onClick={onSettings}
          className="w-full text-left px-3 py-1.5 text-sm text-[#d1d4dc] hover:bg-[#2a2e39]"
        >
          {strings.drawingSettings}
        </button>
        <button
          onClick={onDelete}
          className="w-full text-left px-3 py-1.5 text-sm text-[#f23645] hover:bg-[#2a2e39]"
        >
          {strings.drawingDelete}
        </button>
      </div>
    </>
  );
}

// ---------- 文字输入框 ----------

function TextInput({
  store,
  id,
  x,
  y,
  onCommit,
  onCancel,
}: {
  store: DrawingStore;
  id: string | null;
  x: number;
  y: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(() => (id ? (store.get(id)?.style.text ?? '') : ''));
  const doneRef = useRef(false);
  const pos = clampPos(x, y);

  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={strings.drawingTextPlaceholder}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(false)}
      className="absolute pointer-events-auto h-8 px-2 rounded bg-[#1e222d] border border-[#2962ff] text-sm text-[#d1d4dc] outline-none"
      style={{ ...pos, width: 200 }}
    />
  );
}
