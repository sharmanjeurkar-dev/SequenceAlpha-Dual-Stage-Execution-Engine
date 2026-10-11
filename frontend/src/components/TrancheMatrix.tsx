import React from 'react';
import type { TrancheSlot } from '../types/portfolio';

interface TrancheMatrixProps {
  slots: TrancheSlot[];
  selectedSlotId: number;
  onSelectSlot: (slotId: number) => void;
  onRatchetStop: (slotId: number) => void;
  onEmergencyClose: (slotId: number) => void;
}

export const TrancheMatrix: React.FC<TrancheMatrixProps> = ({
  slots,
  selectedSlotId,
  onSelectSlot,
  onRatchetStop,
  onEmergencyClose,
}) => {
  const occupiedCount = slots.filter((s) => s.symbol).length;

  return (
    <div className="bg-[#0a0d13] border border-[#1e2633] p-3 rounded flex flex-col font-mono text-xs shadow-inner space-y-2">
      <div className="flex items-center justify-between border-b border-[#1e2633] pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[#ff9900] font-bold">TRANCHES.MONITOR</span>
          <span className="text-white font-bold">15-SLOT COHORT ALLOCATION</span>
        </div>
        <span className="text-[11px] text-[#00ff66] font-bold">
          {occupiedCount} / 15 OCCUPIED
        </span>
      </div>

      {/* Mini 15-Slot Grid */}
      <div className="grid grid-cols-5 gap-1.5">
        {slots.map((s) => {
          const isSelected = s.slot_id === selectedSlotId;
          if (!s.symbol) {
            return (
              <div
                key={s.slot_id}
                onClick={() => onSelectSlot(s.slot_id)}
                className={`p-1 text-center bg-[#070a0e] border ${
                  isSelected ? 'border-[#ff9900]' : 'border-[#151c27]'
                } rounded-sm cursor-pointer hover:border-gray-500 text-[10px]`}
              >
                <span className="text-gray-600 font-bold block">#{s.slot_id}</span>
                <span className="text-gray-700 font-mono">EMPTY</span>
              </div>
            );
          }
          const isUp = s.pnl_pct >= 0;
          return (
            <div
              key={s.slot_id}
              onClick={() => onSelectSlot(s.slot_id)}
              className={`p-1 text-center border rounded-sm cursor-pointer hover:brightness-125 text-[10px] transition-all ${
                s.target_hit
                  ? 'bg-[#0a181d] border-[#00e5ff]'
                  : 'bg-[#0a1210] border-[#00ff66]'
              } ${isSelected ? 'ring-1 ring-[#ff9900]' : ''}`}
            >
              <div className="flex justify-between items-center text-[9px] text-gray-400">
                <span className="font-bold">#{s.slot_id}</span>
                <span>B{s.holding_bar}/5</span>
              </div>
              <div className="font-bold text-white truncate text-[10px]">
                {s.symbol.replace('NSE:', '').replace('-EQ', '')}
              </div>
              <div
                className={`font-bold text-[10px] ${
                  isUp ? 'text-[#00ff66]' : 'text-[#ff3344]'
                }`}
              >
                {isUp ? '+' : ''}
                {s.pnl_pct.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Slots Table */}
      <div className="text-[11px] font-bold text-[#ff9900] pt-1">
        ACTIVE PORTFOLIO SLOTS (ACCOUNT A)
      </div>
      <div className="overflow-y-auto max-h-[250px] border border-[#1e2633] rounded-sm">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead className="bg-[#121822] text-[#7d8590] sticky top-0 border-b border-[#212b3a]">
            <tr>
              <th className="p-1.5">SLOT</th>
              <th className="p-1.5">SYMBOL</th>
              <th className="p-1.5">ENTRY</th>
              <th className="p-1.5">LTP</th>
              <th className="p-1.5">P&amp;L %</th>
              <th className="p-1.5">STOP</th>
              <th className="p-1.5">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#151d28] font-mono">
            {slots
              .filter((s) => s.symbol)
              .map((s) => {
                const isSelected = s.slot_id === selectedSlotId;
                const isUp = s.pnl_pct >= 0;
                return (
                  <tr
                    key={s.slot_id}
                    onClick={() => onSelectSlot(s.slot_id)}
                    className={`cursor-pointer hover:bg-[#121924] ${
                      isSelected ? 'bg-[#18202d] text-white' : ''
                    }`}
                  >
                    <td
                      className={`p-1.5 font-bold ${
                        s.target_hit ? 'text-[#00e5ff]' : 'text-[#ff9900]'
                      }`}
                    >
                      #{s.slot_id}
                    </td>
                    <td className="p-1.5 font-bold">{s.symbol}</td>
                    <td className="p-1.5 text-gray-300">₹{s.entry_price.toFixed(2)}</td>
                    <td
                      className={`p-1.5 font-bold ${
                        isUp ? 'text-[#00ff66]' : 'text-[#ff3344]'
                      }`}
                    >
                      ₹{s.ltp.toFixed(2)}
                    </td>
                    <td
                      className={`p-1.5 font-bold ${
                        isUp ? 'text-[#00ff66]' : 'text-[#ff3344]'
                      }`}
                    >
                      {isUp ? '+' : ''}
                      {s.pnl_pct.toFixed(2)}%
                    </td>
                    <td className="p-1.5 text-[#ff9900]">₹{s.stop_price.toFixed(2)}</td>
                    <td className="p-1.5">
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onRatchetStop(s.slot_id)}
                          className="px-1 py-0.5 bg-[#142318] hover:bg-[#00ff66] text-[#00ff66] hover:text-black border border-[#00ff66] rounded text-[9px] font-bold"
                          title="Ratchet Stop"
                        >
                          RATCHET
                        </button>
                        <button
                          onClick={() => onEmergencyClose(s.slot_id)}
                          className="px-1 py-0.5 bg-[#2a0e12] hover:bg-[#ff3344] text-[#ff3344] hover:text-black border border-[#ff3344] rounded text-[9px] font-bold"
                          title="Emergency Close"
                        >
                          CLOSE
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-gray-400 flex items-center justify-between bg-[#0e1219] p-1.5 rounded border border-[#1b2330]">
        <span>
          Cohort: <span className="text-white font-bold">15:05 IST (3 slots/day)</span>
        </span>
        <span>
          Target Profit: <span className="text-[#00ff66] font-bold">+6.0%</span>
        </span>
        <span>
          Stop Cut: <span className="text-[#ff3344] font-bold">-4.5%</span>
        </span>
      </div>
    </div>
  );
};
