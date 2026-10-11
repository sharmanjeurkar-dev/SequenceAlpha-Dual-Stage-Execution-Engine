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
          <span className="text-white font-bold">REALTIME BROKER ORDERS &amp; FILLS</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-[#00ff66]" />
          <span className="text-gray-400">BROKER: FYERS V3</span>
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

      <div className="overflow-y-auto max-h-[170px] border border-[#1e2633] rounded-sm">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead className="bg-[#121822] text-[#7d8590] sticky top-0 border-b border-[#212b3a]">
            <tr>
              <th className="p-1.5">TIME</th>
              <th className="p-1.5">ORDER ID</th>
              <th className="p-1.5">ACCT</th>
              <th className="p-1.5">SIDE</th>
              <th className="p-1.5">SYMBOL</th>
              <th className="p-1.5">QTY</th>
              <th className="p-1.5">FILL</th>
              <th className="p-1.5">TAG</th>
              <th className="p-1.5">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#151d28]">
            {orders.map((o) => (
              <tr key={o.order_id} className="hover:bg-[#121924]">
                <td className="p-1.5 text-gray-400">{o.timestamp}</td>
                <td className="p-1.5 font-bold text-gray-300">{o.order_id}</td>
                <td className="p-1.5 text-[#ff9900]">{o.account}</td>
                <td
                  className={`p-1.5 font-bold ${
                    o.side === 'BUY' ? 'text-[#00ff66]' : 'text-[#ff3344]'
                  }`}
                >
                  {o.side}
                </td>
                <td className="p-1.5 font-bold text-white">{o.symbol}</td>
                <td className="p-1.5 text-gray-300">{o.quantity}</td>
                <td className="p-1.5 text-white font-bold">₹{o.fill_price.toFixed(2)}</td>
                <td className="p-1.5 text-cyan-400 text-[10px]">{o.strategy_tag}</td>
                <td className="p-1.5 text-[#00ff66] font-bold">{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
