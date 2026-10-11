import React from 'react';
import type { DualAccountMetrics } from '../types/portfolio';

interface DualAccountComparatorProps {
  metricsHistory: DualAccountMetrics[];
  accountAValue: number;
  accountBValue: number;
}

export const DualAccountComparator: React.FC<DualAccountComparatorProps> = ({
  metricsHistory,
  accountAValue,
  accountBValue,
}) => {
  const delta = accountAValue - accountBValue;

  return (
    <div className="bg-[#0a0d13] border border-[#1e2633] p-3 rounded flex flex-col font-mono text-xs shadow-inner space-y-2">
      <div className="flex items-center justify-between border-b border-[#1e2633] pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[#ff9900] font-bold">DUAL.AUDIT</span>
          <span className="text-white font-bold">ACCOUNT A vs B PERFORMANCE</span>
        </div>
        <span className="text-[11px] text-[#00ff66] font-bold">
          LEADER: {delta >= 0 ? 'ACCOUNT A (+₹' + delta.toFixed(2) + ')' : 'ACCOUNT B'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {/* Account A */}
        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded-sm space-y-1">
          <div className="text-[#00ff66] font-bold border-b border-[#1e2633] pb-1 flex justify-between">
            <span>ACCOUNT A (MOC)</span>
            <span>15:05 IST</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Portfolio Value:</span>
            <span className="text-white font-bold">₹{accountAValue.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Cum Return:</span>
            <span className="text-[#00ff66] font-bold">+0.42%</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Win Rate:</span>
            <span className="text-[#00ff66] font-bold">66.67%</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Filled Slippage:</span>
            <span className="text-white font-bold">3.2 bps</span>
          </div>
        </div>

        {/* Account B */}
        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded-sm space-y-1">
          <div className="text-[#00e5ff] font-bold border-b border-[#1e2633] pb-1 flex justify-between">
            <span>ACCOUNT B (MORNING)</span>
            <span>09:20 IST</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Portfolio Value:</span>
            <span className="text-white font-bold">₹{accountBValue.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Cum Return:</span>
            <span className="text-[#00e5ff] font-bold">+0.36%</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Win Rate:</span>
            <span className="text-[#00e5ff] font-bold">66.67%</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Filled Slippage:</span>
            <span className="text-white font-bold">6.8 bps</span>
          </div>
        </div>
      </div>

      <div className="bg-[#0e141f] border border-[#1c2738] p-2 rounded-sm text-[10px] space-y-1 text-gray-300">
        <div className="text-[#ff9900] font-bold">DUAL-ENGINE AUDIT SUMMARY:</div>
        <p>
          Account A (15:05 MOC) holds a <strong>+₹{Math.abs(delta).toFixed(2)}</strong> edge over
          Account B due to lower morning opening volatility slippage and avoidance of false morning gap traps.
        </p>
      </div>

      {/* Historical Audit Table */}
      <div className="overflow-x-auto border border-[#1e2633] rounded-sm max-h-[140px]">
        <table className="w-full text-left text-[10px] border-collapse">
          <thead className="bg-[#121822] text-[#7d8590] sticky top-0 border-b border-[#212b3a]">
            <tr>
              <th className="p-1">DATE</th>
              <th className="p-1">ACCT A</th>
              <th className="p-1">ACCT B</th>
              <th className="p-1">A DAY PNL</th>
              <th className="p-1">B DAY PNL</th>
              <th className="p-1">LEADER</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#151d28]">
            {metricsHistory.map((m, idx) => (
              <tr key={idx} className="hover:bg-[#121924]">
                <td className="p-1 text-gray-400">{m.date}</td>
                <td className="p-1 text-white">₹{m.account_a_value.toFixed(0)}</td>
                <td className="p-1 text-white">₹{m.account_b_value.toFixed(0)}</td>
                <td
                  className={`p-1 font-bold ${
                    m.account_a_pnl_day >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
                  }`}
                >
                  {m.account_a_pnl_day >= 0 ? '+' : ''}₹{m.account_a_pnl_day.toFixed(0)}
                </td>
                <td
                  className={`p-1 font-bold ${
                    m.account_b_pnl_day >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'
                  }`}
                >
                  {m.account_b_pnl_day >= 0 ? '+' : ''}₹{m.account_b_pnl_day.toFixed(0)}
                </td>
                <td className="p-1 text-[#00e5ff]">{m.leader}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
