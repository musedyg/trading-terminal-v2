'use client';

// 品种搜索下拉（从 M1 page.tsx 抽出，供 M3 多窗格的每个窗格头复用）

import { useEffect, useRef, useState } from 'react';
import { SYMBOLS, normalizeSymbolInput, resolveSymbol, type Market, type SymbolInfo } from '@/lib/symbols';
import { strings } from '@/lib/i18n';

const MARKET_LABELS: Record<Market, string> = {
  crypto: strings.marketCrypto,
  cn: strings.marketCn,
  us: strings.marketUs,
};
const MARKET_ORDER: Market[] = ['crypto', 'cn', 'us'];

function groupSymbols(query: string): Record<Market, SymbolInfo[]> {
  const q = query.trim().toLowerCase();
  const groups: Record<Market, SymbolInfo[]> = { crypto: [], cn: [], us: [] };
  for (const s of SYMBOLS) {
    if (q && !`${s.id} ${s.label}`.toLowerCase().includes(q)) continue;
    groups[s.market].push(s);
  }
  return groups;
}

export interface SymbolSearchProps {
  /** 当前选中品种 */
  symbol: SymbolInfo;
  onPick: (s: SymbolInfo) => void;
  /** 紧凑模式（窗格头用） */
  compact?: boolean;
}

export default function SymbolSearch({ symbol, onPick, compact = false }: SymbolSearchProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [dropdownOpen]);

  const groups = groupSymbols(query);
  // 输代码直查：输入能解析成品种、且不在预设结果里时，给一行「直接查询」
  const directId = dropdownOpen ? normalizeSymbolInput(query) : null;
  const directInfo = directId ? resolveSymbol(directId) : undefined;
  const directShown =
    directInfo !== undefined &&
    !MARKET_ORDER.some((m) => groups[m].some((s) => s.id === directInfo.id));

  return (
    <div ref={searchRef} className="relative shrink-0">
      <input
        value={dropdownOpen ? query : symbol.label}
        placeholder={strings.searchPlaceholder}
        onFocus={() => {
          setQuery('');
          setDropdownOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setDropdownOpen(true);
        }}
        className={`h-8 px-2 rounded bg-[#1e222d] border border-[#2a2e39] text-sm outline-none focus:border-[#2962ff] placeholder:text-[#787b86] ${
          compact ? 'w-36' : 'w-48'
        }`}
      />
      {dropdownOpen && (
        <div className="absolute z-50 mt-1 w-64 max-h-80 overflow-y-auto rounded border border-[#2a2e39] bg-[#1e222d] shadow-lg">
          {MARKET_ORDER.map((m) => (
            <div key={m}>
              {groups[m].length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-xs text-[#787b86]">{MARKET_LABELS[m]}</div>
                  {groups[m].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        onPick(s);
                        setQuery('');
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#2a2e39] ${
                        s.id === symbol.id ? 'text-[#2962ff]' : ''
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </>
              )}
            </div>
          ))}
          {directShown && directInfo && (
            <button
              onClick={() => {
                onPick(directInfo);
                setQuery('');
                setDropdownOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-[#26a69a] hover:bg-[#2a2e39] border-t border-[#2a2e39]"
            >
              {strings.directQuery} {directInfo.label}
              <span className="ml-2 text-xs text-[#787b86]">{MARKET_LABELS[directInfo.market]}</span>
            </button>
          )}
          {MARKET_ORDER.every((m) => groups[m].length === 0) && !directShown && (
            <div className="px-3 py-3 text-sm text-[#787b86]">{strings.noMatch}</div>
          )}
        </div>
      )}
    </div>
  );
}
