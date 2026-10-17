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
  daysPnl: number;
  daysPnlPct: number;
  realisedPnl: number;
  todayRealisedPnl: number;
  unrealisedPnl: number;
  unrealisedPnlPct: number;
}

const formatSignedInr = (val: number) => {
  const sign = val >= 0 ? '+' : '-';
  return `${sign}₹${Math.abs(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const KpiSummaryStrip: React.FC<KpiSummaryStripProps> = ({
  totalAum,
  aumPct,
  investedValue,
  cashBuffer,
  activeSlotsCount,
  winRatePct,
  totalTrades,
  quarantineCount,
  daysPnl,
  daysPnlPct,
  realisedPnl,
  todayRealisedPnl,
  unrealisedPnl,
  unrealisedPnlPct,
}) => {
  const cashPct = totalAum > 0 ? (cashBuffer / totalAum) * 100 : 0;
  const investedPct = totalAum > 0 ? (investedValue / totalAum) * 100 : 0;
  const realisedPct = (realisedPnl / 1000000) * 100;

  return (
    <section className="bg-[#0b0e14] border-b border-[#212936] p-2.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 font-mono text-xs select-none">
      {/* 1. Paper Portfolio AUM */}
      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#ff9900] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">
          Paper Portfolio AUM (14:50 EOD)
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-sm xl:text-base font-extrabold text-white">
            ₹{totalAum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span
            className={`text-[11px] font-bold ${
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
          <span className="text-sm xl:text-base font-extrabold text-[#00ff66]">
            ₹{investedValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          <span className="text-sm xl:text-base font-extrabold text-[#ffb700]">
            ₹{cashBuffer.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-gray-400 font-bold">{cashPct.toFixed(1)}%</span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Open Tranches:{' '}
          <span className="text-[#00ff66] font-bold">{15 - activeSlotsCount} / 15</span>
        </div>
      </div>

      {/* 4. Day's P&L (Live Intraday Total) */}
      <div
        className={`bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 shadow-inner ${
          daysPnl >= 0 ? 'border-l-[#00ff66]' : 'border-l-[#ff3344]'
        }`}
      >
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">
          Day&apos;s P&amp;L (Live MTM)
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span
            className={`text-sm xl:text-base font-extrabold ${
              daysPnl >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
            }`}
          >
            {formatSignedInr(daysPnl)}
          </span>
          <span
            className={`text-[11px] font-bold ${
              daysPnlPct >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
            }`}
          >
            {daysPnlPct >= 0 ? '+' : ''}
            {daysPnlPct.toFixed(2)}%
          </span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Intraday Net (Realised + Open MTM)
        </div>
      </div>

      {/* 5. Unrealised P&L (Open Positions) */}
      <div
        className={`bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 shadow-inner ${
          unrealisedPnl >= 0 ? 'border-l-[#00ff66]' : 'border-l-[#ff3344]'
        }`}
      >
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">
          Unrealised P&amp;L (Open)
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span
            className={`text-sm xl:text-base font-extrabold ${
              unrealisedPnl >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
            }`}
          >
            {formatSignedInr(unrealisedPnl)}
          </span>
          <span
            className={`text-[11px] font-bold ${
              unrealisedPnlPct >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
            }`}
          >
            {unrealisedPnlPct >= 0 ? '+' : ''}
            {unrealisedPnlPct.toFixed(2)}%
          </span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Across <span className="text-white font-bold">{activeSlotsCount}</span> Active Tranches
        </div>
      </div>

      {/* 6. Realised P&L (Booked Trades) */}
      <div
        className={`bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 shadow-inner ${
          realisedPnl >= 0 ? 'border-l-[#00ff66]' : 'border-l-[#ff3344]'
        }`}
      >
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">
          Realised P&amp;L (Booked)
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span
            className={`text-sm xl:text-base font-extrabold ${
              realisedPnl >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
            }`}
          >
            {formatSignedInr(realisedPnl)}
          </span>
          <span
            className={`text-[11px] font-bold ${
              realisedPct >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
            }`}
          >
            {realisedPct >= 0 ? '+' : ''}
            {realisedPct.toFixed(2)}%
          </span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          Today Booked:{' '}
          <span className={todayRealisedPnl >= 0 ? 'text-[#00ff66] font-bold' : 'text-[#ff3344] font-bold'}>
            {formatSignedInr(todayRealisedPnl)}
          </span>
        </div>
      </div>

      {/* 7. Champion OOS Backtest */}
      <div className="bg-[#0a0d13] border border-[#1e2633] p-2 border-l-2 border-l-[#00e5ff] shadow-inner">
        <div className="text-[#7d8590] text-[10px] uppercase font-semibold">
          Champion Backtest (3.7Y OOS)
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-sm xl:text-base font-extrabold text-[#00e5ff]">₹41,16,835</span>
          <span className="text-[11px] text-[#00ff66] font-bold">+311.7%</span>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-0.5">
          CAGR: <span className="text-[#00ff66] font-bold">46.79%</span> | Sharpe:{' '}
          <span className="text-white font-bold">1.70</span>
        </div>
      </div>
    </section>
  );
};
