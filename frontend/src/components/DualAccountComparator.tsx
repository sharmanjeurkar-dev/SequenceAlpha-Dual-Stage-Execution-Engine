import React, { useState } from 'react';
import type { DailySummaryMetric, PaperTradeRecord } from '../types/portfolio';

interface PaperTradingAuditProps {
  dailySummary: DailySummaryMetric[];
  trades: PaperTradeRecord[];
  quarantine?: Record<string, number>;
}

export const DualAccountComparator: React.FC<PaperTradingAuditProps> = ({
  dailySummary,
  trades,
  quarantine = {},
}) => {
  const [subView, setSubView] = useState<'summary' | 'trades'>('summary');
  const latest = dailySummary[dailySummary.length - 1] || {
    date: '2026-10-07',
    portfolio_value: 993941.81,
    cash_balance: 363715.01,
    invested_value: 630226.8,
    pnl_day: -1744.77,
    cum_return_pct: -0.61,
    active_slots: 11,
    win_rate_pct: 50.0,
    total_trades: 10,
  };

  const quarantineEntries = Object.entries(quarantine);

  return (
    <div className="bg-[#0a0d13] border border-[#1e2633] p-3 rounded flex flex-col font-mono text-xs shadow-inner space-y-2">
      <div className="flex items-center justify-between border-b border-[#1e2633] pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[#ff9900] font-bold">PAPER.AUDIT</span>
          <span className="text-white font-bold">14:50 EOD CONTINUOUS ACCOUNT LEDGER</span>
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          <button
            onClick={() => setSubView('summary')}
            className={`px-2 py-0.5 rounded-sm font-bold ${
              subView === 'summary'
                ? 'bg-[#ff9900] text-black'
                : 'bg-[#141c27] text-gray-300 hover:text-white'
            }`}
          >
            DAILY SUMMARY ({dailySummary.length})
          </button>
          <button
            onClick={() => setSubView('trades')}
            className={`px-2 py-0.5 rounded-sm font-bold ${
              subView === 'trades'
                ? 'bg-[#00e5ff] text-black'
                : 'bg-[#141c27] text-gray-300 hover:text-white'
            }`}
          >
            CLOSED TRADES ({trades.length})
          </button>
        </div>
      </div>

      {/* Single Account Live Snapshot */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded-sm space-y-1">
          <div className="text-[#00ff66] font-bold border-b border-[#1e2633] pb-1 flex justify-between">
            <span>PORTFOLIO VALUATION</span>
            <span>{latest.date}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Total Equity:</span>
            <span className="text-white font-bold">
              ₹{latest.portfolio_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Invested Capital:</span>
            <span className="text-[#00e5ff] font-bold">
              ₹{latest.invested_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Cash Balance:</span>
            <span className="text-[#ffb700] font-bold">
              ₹{latest.cash_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded-sm space-y-1">
          <div className="text-[#00e5ff] font-bold border-b border-[#1e2633] pb-1 flex justify-between">
            <span>EXECUTION &amp; RISK METRICS</span>
            <span>14:50 IST</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Full-Pos Win Rate:</span>
            <span className="text-[#00ff66] font-bold">{latest.win_rate_pct.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Closed Positions:</span>
            <span className="text-white font-bold">{latest.total_trades}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Active Tranches:</span>
            <span className="text-[#00ff66] font-bold">{latest.active_slots} / 15</span>
          </div>
        </div>
      </div>

      {/* Quarantine Banner */}
      <div className="bg-[#0e141f] border border-[#1c2738] p-1.5 rounded-sm text-[10px] flex flex-wrap items-center justify-between gap-1 text-gray-300">
        <span className="text-[#ff9900] font-bold">QUARANTINE (5-BAR COOLDOWN):</span>
        {quarantineEntries.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {quarantineEntries.map(([sym, bars]) => (
              <span
                key={sym}
                className="px-1.5 py-0.2 bg-[#2a0e12] text-[#ff3344] border border-[#ff3344] rounded text-[9px] font-bold"
              >
                {sym.replace('NSE:', '')} ({bars}d)
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[#00ff66]">NONE</span>
        )}
      </div>

      {/* Table Area */}
      {subView === 'summary' ? (
        <div className="overflow-x-auto border border-[#1e2633] rounded-sm max-h-[155px]">
          <table className="w-full text-left text-[10px] border-collapse">
            <thead className="bg-[#121822] text-[#7d8590] sticky top-0 border-b border-[#212b3a]">
              <tr>
                <th className="p-1">DATE</th>
                <th className="p-1">EQUITY</th>
                <th className="p-1">INVESTED</th>
                <th className="p-1">DAY PNL</th>
                <th className="p-1">CUM %</th>
                <th className="p-1">SLOTS</th>
                <th className="p-1">WIN %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#151d28]">
              {dailySummary.map((m, idx) => (
                <tr key={idx} className="hover:bg-[#121924]">
                  <td className="p-1 text-gray-400">{m.date}</td>
                  <td className="p-1 text-white font-bold">₹{m.portfolio_value.toFixed(0)}</td>
                  <td className="p-1 text-gray-300">₹{m.invested_value.toFixed(0)}</td>
                  <td
                    className={`p-1 font-bold ${
                      m.pnl_day >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
                    }`}
                  >
                    {m.pnl_day >= 0 ? '+' : ''}₹{m.pnl_day.toFixed(0)}
                  </td>
                  <td
                    className={`p-1 font-bold ${
                      m.cum_return_pct >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
                    }`}
                  >
                    {m.cum_return_pct >= 0 ? '+' : ''}
                    {m.cum_return_pct.toFixed(2)}%
                  </td>
                  <td className="p-1 text-[#00e5ff]">{m.active_slots}/15</td>
                  <td className="p-1 text-white">{m.win_rate_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#1e2633] rounded-sm max-h-[155px]">
          <table className="w-full text-left text-[10px] border-collapse">
            <thead className="bg-[#121822] text-[#7d8590] sticky top-0 border-b border-[#212b3a]">
              <tr>
                <th className="p-1">SYMBOL</th>
                <th className="p-1">SHARES</th>
                <th className="p-1">ENTRY</th>
                <th className="p-1">EXIT</th>
                <th className="p-1">NET PNL</th>
                <th className="p-1">RET %</th>
                <th className="p-1">REASON</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#151d28]">
              {trades.map((t, idx) => (
                <tr key={idx} className="hover:bg-[#121924]">
                  <td className="p-1 text-white font-bold">{t.symbol.replace('NSE:', '')}</td>
                  <td className="p-1 text-gray-300">{t.shares}</td>
                  <td className="p-1 text-gray-400">₹{t.entry_price.toFixed(2)}</td>
                  <td className="p-1 text-gray-300">₹{t.exit_price.toFixed(2)}</td>
                  <td
                    className={`p-1 font-bold ${
                      t.net_pnl >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
                    }`}
                  >
                    {t.net_pnl >= 0 ? '+' : ''}₹{t.net_pnl.toFixed(0)}
                  </td>
                  <td
                    className={`p-1 font-bold ${
                      t.net_return_pct >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
                    }`}
                  >
                    {t.net_return_pct >= 0 ? '+' : ''}
                    {t.net_return_pct.toFixed(2)}%
                  </td>
                  <td className="p-1 text-gray-400 truncate max-w-[140px]" title={t.exit_reason}>
                    {t.exit_reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
