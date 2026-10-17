import React from 'react';
import type { TickerItem } from '../types/portfolio';

interface TickerTapeProps {
  items: TickerItem[];
  onSelectSymbol: (symbol: string) => void;
}

export const TickerTape: React.FC<TickerTapeProps> = ({ items, onSelectSymbol }) => {
  return (
    <div className="bg-[#05070a] border-b border-[#1c2430] py-1 overflow-hidden relative font-mono text-[11px] flex items-center select-none">
      <div className="bg-[#ff9900] text-black font-extrabold px-2 py-0.5 text-[10px] z-10 shrink-0 shadow-md">
        LIVE TICK
      </div>
      <div className="overflow-hidden w-full whitespace-nowrap relative">
        <div className="animate-ticker flex items-center gap-6">
          {items.concat(items).map((t, idx) => (
            <span
              key={`${t.symbol}-${idx}`}
              onClick={() => onSelectSymbol(t.symbol)}
              className="inline-flex items-center gap-1.5 cursor-pointer hover:underline"
            >
              {t.is_index && (
                <span className="text-[9px] bg-[#131d2e] text-[#38bdf8] border border-[#1e3a5f] px-1 rounded font-bold">
                  IDX
                </span>
              )}
              <span className={t.is_index ? 'text-[#f8fafc] font-extrabold' : 'text-white font-bold'}>
                {t.symbol.replace('NSE:', '').replace('-EQ', '')}
              </span>
              <span className="text-gray-300">
                {t.is_index ? '' : '₹'}
                {t.price.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className={`font-bold ${t.up ? 'text-[#00ff66]' : 'text-[#ff3344]'}`}>
                {t.change_pct >= 0 ? '+' : ''}
                {t.change_pct.toFixed(2)}%
              </span>
              <span className="text-gray-600">|</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
