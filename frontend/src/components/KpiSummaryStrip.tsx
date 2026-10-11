import React from 'react';

interface KpiSummaryStripProps {
  totalAum: number;
  aumPct: number;
  investedValue: number;
  cashBuffer: number;
  activeSlotsCount: number;
  winRatePct: number;
  totalTrades: number;
  quarantineCount: number;
}

export const KpiSummaryStrip: React.FC<KpiSummaryStripProps> = ({
  totalAum,
  aumPct,
  investedValue,
  cashBuffer,
  activeSlotsCount,
  winRatePct,
  totalTrades,
  quarantineCount,
}) => {
  const cashPct = totalAum > 0 ? (cashBuffer / totalAum) * 100 : 0;
  const investedPct = totalAum > 0 ? (investedValue / totalAum) * 100 : 0;

  return (
    <section className="bg-[#0b0e14] border-b border-[#212936] p-2.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 font-mono text-xs select-none">
      {/* 1. Paper Portfolio AUM */}
      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#ff9900] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">
          Paper Portfolio AUM (14:50 EOD)
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-white">
            ₹{totalAum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span
            className={`text-xs font-bold ${
              aumPct >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
            }`}
          >
            {aumPct >= 0 ? '+' : ''}
            {aumPct.toFixed(2)}%
          </span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Active Slots: <span className="text-[#00ff66] font-bold">{activeSlotsCount} / 15</span> |
          Quarantine: <span className="text-[#ff9900] font-bold">{quarantineCount}</span>
        </div>
      </div>

      {/* 2. Invested Capital */}
      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#00ff66] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">
          Invested Equity Exposure
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-[#00ff66]">
            ₹{investedValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-[#00ff66] font-bold">{investedPct.toFixed(1)}%</span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Win Rate: <span className="text-[#00ff66] font-bold">{winRatePct.toFixed(1)}%</span> (
          {totalTrades} closed)
        </div>
      </div>

      {/* 3. Cash Buffer / Reserve */}
      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#ffb700] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">Cash Reserve</div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-[#ffb700]">
            ₹{cashBuffer.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-gray-400 font-bold">{cashPct.toFixed(1)}%</span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Open Tranches:{' '}
          <span className="text-[#00ff66] font-bold">{15 - activeSlotsCount} / 15</span>
        </div>
      </div>

      {/* 4. Champion OOS Backtest */}
      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#00e5ff] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">
          Champion Backtest (3.7Y OOS)
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-[#00e5ff]">₹41,16,835</span>
          <span className="text-[11px] text-[#00ff66] font-bold">+311.7%</span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          CAGR: <span className="text-[#00ff66] font-bold">46.79%</span> | Sharpe:{' '}
          <span className="text-white font-bold">1.70</span>
        </div>
      </div>

      {/* 5. Alpha Model Inferences */}
      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#a855f7] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">
          HybridQuantile TFT (Fold 14)
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-[#a855f7]">IC-IR 3.47</span>
          <span className="text-[11px] text-[#00ff66] font-bold">CS-IC +0.0172</span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Smooth Tanh w=<span className="text-white font-mono">1.75</span> | 12/15 Pos Folds
        </div>
      </div>

      {/* 6. Champion Strategy Rules */}
      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#ff3344] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">
          Champion Risk Guardrails
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-base font-extrabold text-[#00ff66]">SKEW &ge; 1.25</span>
          <span className="text-[11px] text-gray-400">p50 &gt; 0</span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Stop: <span className="text-[#ff3344] font-mono">-4.5%</span> | Tgt1:{' '}
          <span className="text-[#00ff66] font-mono">+6.0%</span> | BE:{' '}
          <span className="text-white font-mono">+1.0%</span>
        </div>
      </div>
    </section>
  );
};
