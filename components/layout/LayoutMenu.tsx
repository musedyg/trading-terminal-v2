'use client';

// 命名布局菜单（M3 阶段 A）：保存当前 / 加载 / 重命名 / 删除。
// 纯 UI，数据读写由父组件经 lib/layout/types.ts 完成。

import { useEffect, useRef, useState } from 'react';
import type { NamedLayout } from '@/lib/layout/types';
import { strings } from '@/lib/i18n';

export interface LayoutMenuProps {
  layouts: NamedLayout[];
  onSave: (name: string) => void;
  onLoad: (layout: NamedLayout) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function LayoutMenu({ layouts, onSave, onLoad, onRename, onDelete }: LayoutMenuProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open ]);

  const doSave = () => {
    const n = name.trim();
    if (!n) return;
    onSave(n);
    setName('');
  };

  const startRename = (l: NamedLayout) => {
    setRenamingId(l.id);
    setRenameValue(l.name);
  };

  const doRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`h-8 px-3 rounded text-sm border ${
          open
            ? 'bg-[#2962ff] text-white border-[#2962ff]'
            : 'text-[#b2b5be] bg-[#1e222d] border-[#2a2e39] hover:bg-[#2a2e39]'
        }`}
      >
        {strings.layouts}（{layouts.length}）
      </button>
      {open && (
        <div className="absolute z-50 mt-1 right-0 w-72 rounded border border-[#2a2e39] bg-[#1e222d] shadow-lg p-3">
          {/* 保存当前 */}
          <div className="flex gap-2 mb-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={strings.layoutNamePlaceholder}
              maxLength={40}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doSave();
                e.stopPropagation();
              }}
              className="flex-1 h-8 px-2 rounded bg-[#131722] border border-[#2a2e39] text-sm text-[#d1d4dc] outline-none focus:border-[#2962ff] placeholder:text-[#787b86]"
            />
            <button
              onClick={doSave}
              disabled={!name.trim()}
              className="h-8 px-3 rounded text-sm bg-[#2962ff] text-white hover:bg-[#1e53e5] disabled:opacity-40"
            >
              {strings.layoutSave}
            </button>
          </div>
          {/* 已保存列表 */}
          {layouts.length === 0 && (
            <div className="py-2 text-sm text-[#787b86] text-center">{strings.layoutEmpty}</div>
          )}
          <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
            {layouts.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-[#2a2e39]"
              >
                {renamingId === l.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') doRename();
                      else if (e.key === 'Escape') setRenamingId(null);
                      e.stopPropagation();
                    }}
                    onBlur={doRename}
                    maxLength={40}
                    className="flex-1 h-7 px-2 rounded bg-[#131722] border border-[#2962ff] text-sm text-[#d1d4dc] outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      onLoad(l);
                      setOpen(false);
                    }}
                    className="flex-1 text-left text-sm text-[#d1d4dc] truncate"
                    title={`${l.name}（${l.paneCount}图）`}
                  >
                    {l.name}
                    <span className="ml-2 text-xs text-[#787b86]">{l.paneCount}图</span>
                  </button>
                )}
                {renamingId !== l.id && (
                  <>
                    <button
                      onClick={() => startRename(l)}
                      className="px-2 h-7 rounded text-xs text-[#b2b5be] hover:bg-[#363c4e]"
                    >
                      {strings.layoutRename}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(strings.layoutDeleteConfirm)) onDelete(l.id);
                      }}
                      className="px-2 h-7 rounded text-xs text-[#f23645] hover:bg-[#363c4e]"
                    >
                      {strings.layoutDelete}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
