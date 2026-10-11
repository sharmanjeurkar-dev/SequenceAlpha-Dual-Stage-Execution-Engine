import React from 'react';
import type { FyersOrder } from '../types/portfolio';

interface OrderBlotterProps {
  orders: FyersOrder[];
  onSimulateFill?: () => void;
}

export const OrderBlotter: React.FC<OrderBlotterProps> = ({ orders, onSimulateFill }) => {
  return (
    <div className="bg-[#0a0d13] border border-[#1e2633] p-3 rounded flex flex-col font-mono text-xs shadow-inner space-y-2">
      <div className="flex items-center justify-between border-b border-[#1e2633] pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[#ff9900] font-bold">BLOTTER.STREAM</span>
          <span className="text-white font-bold">PAPER ORDERS &amp; EXECUTION LOG</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-[#00ff66]" />
          <span className="text-gray-400">DATA: FYERS V3 WS | EXEC: ZERODHA KITE (14:50 EOD)</span>
          {onSimulateFill && (
            <button
              onClick={onSimulateFill}
              className="px-2 py-0.5 bg-[#162219] hover:bg-[#00ff66] text-[#00ff66] hover:text-black border border-[#00ff66] rounded font-bold transition-all text-[10px]"
            >
              + SIM TICK FILL
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto max-h-[175px] border border-[#1e2633] rounded-sm">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead className="bg-[#121822] text-[#7d8590] sticky top-0 border-b border-[#212b3a]">
            <tr>
              <th className="p-1.5">TIMESTAMP</th>
              <th className="p-1.5">SIDE</th>
              <th className="p-1.5">SYMBOL</th>
              <th className="p-1.5">ACTION</th>
              <th className="p-1.5">QTY</th>
              <th className="p-1.5">FILL PX</th>
              <th className="p-1.5">TURNOVER</th>
              <th className="p-1.5">FEES</th>
              <th className="p-1.5">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#151d28]">
            {orders.map((o, idx) => (
              <tr key={`${o.order_id}-${idx}`} className="hover:bg-[#121924]">
                <td className="p-1.5 text-gray-400">{o.timestamp.replace('2026-', '')}</td>
                <td
                  className={`p-1.5 font-bold ${
                    o.side === 'BUY' ? 'text-[#00ff66]' : 'text-[#ff3344]'
                  }`}
                >
                  {o.side}
                </td>
                <td className="p-1.5 font-bold text-white">{o.symbol.replace('NSE:', '')}</td>
                <td className="p-1.5 text-cyan-400 text-[10px]">{o.action}</td>
                <td className="p-1.5 text-gray-300">{o.quantity}</td>
                <td className="p-1.5 text-white font-bold">₹{o.fill_price.toFixed(2)}</td>
                <td className="p-1.5 text-gray-300">
                  ₹{o.turnover.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </td>
                <td className="p-1.5 text-[#ff9900]">₹{o.commission.toFixed(2)}</td>
                <td className="p-1.5 text-[#00ff66] font-bold">{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
