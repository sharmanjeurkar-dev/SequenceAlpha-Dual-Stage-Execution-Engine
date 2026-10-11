import React from 'react';

interface KpiSummaryStripProps {
  totalAum: number;
  aumPct: number;
  maxDrawdown: number;
  sharpeRatio: number;
  accountAValue: number;
  accountBValue: number;
  activeSlotsCount: number;
  cashBuffer: number;
  decileSpread: number;
  directionalLoss: number;
}

export const KpiSummaryStrip: React.FC<KpiSummaryStripProps> = ({
  totalAum,
  aumPct,
  maxDrawdown,
  sharpeRatio,
  accountAValue,
  accountBValue,
  activeSlotsCount,
  cashBuffer,
  decileSpread,
  directionalLoss,
}) => {
  const deltaAB = accountAValue - accountBValue;

  return (
    <section className="bg-[#0b0e14] border-b border-[#212936] p-2.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 font-mono text-xs select-none">
      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#ff9900] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">Total Portfolio AUM</div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-white">
            ₹{totalAum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-[#00ff66] font-bold">
            +{aumPct.toFixed(2)}%
          </span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Max DD: <span className="text-white font-mono">{maxDrawdown.toFixed(2)}%</span> | Sharpe:{' '}
          <span className="text-[#ff9900] font-mono">{sharpeRatio.toFixed(2)}</span>
        </div>
      </div>

      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#00ff66] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">Account A (15:05 MOC)</div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-[#00ff66]">
            ₹{accountAValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-[#00ff66] font-bold">{activeSlotsCount} Slots</span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Win Rate: <span className="text-[#00ff66]">66.7%</span> (3 trades)
        </div>
      </div>

      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#00e5ff] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">Account B (09:20 AM)</div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-[#00e5ff]">
            ₹{accountBValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-[#00e5ff] font-bold">{activeSlotsCount} Slots</span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Delta vs A:{' '}
          <span className={deltaAB >= 0 ? 'text-[#ff3344] font-mono' : 'text-[#00ff66] font-mono'}>
            {deltaAB >= 0 ? `-₹${deltaAB.toFixed(2)}` : `+₹${Math.abs(deltaAB).toFixed(2)}`}
          </span>
        </div>
      </div>

      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#ffb700] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">Cash Buffer / Reserve</div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-[#ffb700]">
            ₹{cashBuffer.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-gray-400 font-bold">54.4%</span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Available Tranches:{' '}
          <span className="text-[#00ff66] font-bold">{15 - activeSlotsCount} / 15</span>
        </div>
      </div>

      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#a855f7] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">Alpha Model Inferences</div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-[#a855f7]">TFT-v395</span>
          <span className="text-[11px] text-[#00ff66] font-bold">
            D10-D1 +{decileSpread.toFixed(1)}%
          </span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          DirPenaltyLoss: <span className="text-white font-mono">{directionalLoss.toFixed(4)}</span>
        </div>
      </div>

      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#ff3344] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">Safety &amp; Guardrails</div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-[#00ff66]">ACTIVE</span>
          <span className="text-[11px] text-gray-400">Circuit: 0</span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Gap-Up Cap: <span className="text-white font-mono">+3.5%</span> | Gap-Dn:{' '}
          <span className="text-white font-mono">-2.5%</span>
        </div>
      </div>
    </section>
  );
};
