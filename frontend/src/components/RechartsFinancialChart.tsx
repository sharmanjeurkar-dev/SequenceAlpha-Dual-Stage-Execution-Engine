import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

interface ChartProps {
  mode: 'slot_trail' | 'equity_curve' | 'tft_fan';
  onSetMode: (mode: 'slot_trail' | 'equity_curve' | 'tft_fan') => void;
  symbol: string;
  slotPriceData: Array<{ time: string; price: number; stop: number; target: number }>;
  equityData: Array<{ date: string; portfolio_value: number; invested_value: number; benchmark: number }>;
  tftFanData: Array<{ step: string; p10: number; p50: number; p90: number }>;
  stopPrice?: number;
  targetPrice?: number;
  entryPrice?: number;
  ltp?: number;
  pnlPct?: number;
  holdingBar?: number;
  onRatchetStop: () => void;
  onHarvestFifty: () => void;
  onEmergencyClose: () => void;
}

export const RechartsFinancialChart: React.FC<ChartProps> = ({
  mode,
  onSetMode,
  symbol,
  slotPriceData,
  equityData,
  tftFanData,
  stopPrice,
  targetPrice,
  entryPrice,
  ltp,
  pnlPct,
  holdingBar = 1,
  onRatchetStop,
  onHarvestFifty,
  onEmergencyClose,
}) => {
  return (
    <div className="bg-[#0a0d13] border border-[#1e2633] p-3 rounded flex flex-col font-mono text-xs shadow-inner">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#1e2633] pb-2 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[#ff9900] font-bold">CHART.VIEW</span>
          <span className="text-white font-bold">{symbol} (Champion Flat -4.5% Stop &amp; Trailing)</span>
          <span className="text-[11px] text-[#00ff66] bg-[#0c1f13] px-1.5 py-0.2 rounded border border-[#00ff66]">
            REALTIME
          </span>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 text-[11px]">
          <button
            onClick={() => onSetMode('slot_trail')}
            className={`px-2 py-0.5 rounded-sm font-bold transition-colors ${
              mode === 'slot_trail'
                ? 'bg-[#ff9900] text-black'
                : 'bg-[#161f2a] text-gray-300 hover:text-white'
            }`}
          >
            POSITION TRAIL
          </button>
          <button
            onClick={() => onSetMode('equity_curve')}
            className={`px-2 py-0.5 rounded-sm font-bold transition-colors ${
              mode === 'equity_curve'
                ? 'bg-[#ff9900] text-black'
                : 'bg-[#161f2a] text-gray-300 hover:text-white'
            }`}
          >
            PAPER EQUITY
          </button>
          <button
            onClick={() => onSetMode('tft_fan')}
            className={`px-2 py-0.5 rounded-sm font-bold transition-colors ${
              mode === 'tft_fan'
                ? 'bg-[#ff9900] text-black'
                : 'bg-[#161f2a] text-gray-300 hover:text-white'
            }`}
          >
            TFT FAN (P10/50/90)
          </button>
        </div>
      </div>

      {/* Subheader values */}
      <div className="flex flex-wrap items-center justify-between text-[11px] bg-[#0c1017] px-2.5 py-1.5 my-2 rounded border border-[#1a232f] gap-2">
        <div className="flex items-center gap-3">
          <div>
            LTP: <span className="text-[#00ff66] font-bold">₹{ltp ? ltp.toFixed(2) : '--'}</span>
          </div>
          <div>
            Entry: <span className="text-gray-300 font-bold">₹{entryPrice ? entryPrice.toFixed(2) : '--'}</span>
          </div>
          <div>
            Gain:{' '}
            <span className={`font-bold ${(pnlPct || 0) >= 0 ? 'text-[#00ff66]' : 'text-[#ff3344]'}`}>
              {(pnlPct || 0) >= 0 ? '+' : ''}
              {(pnlPct || 0).toFixed(2)}%
            </span>
          </div>
          <div>
            Target 1 (+6%):{' '}
            <span className="text-[#00e5ff] font-bold">
              ₹{targetPrice ? targetPrice.toFixed(2) : '--'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#7d8590]">Active Stop:</span>
          <span className="text-[#ff9900] font-bold">
            ₹{stopPrice ? stopPrice.toFixed(2) : '--'}
          </span>
          <span className="text-[10px] text-gray-400">Holding Bar: {holdingBar}/5</span>
        </div>
      </div>

      {/* Recharts Canvas Area */}
      <div className="relative w-full h-[300px] bg-[#05070a] border border-[#1b2330] rounded-sm p-1">
        <ResponsiveContainer width="100%" height="100%">
          {mode === 'slot_trail' ? (
            <ComposedChart data={slotPriceData}>
              <CartesianGrid stroke="#141a24" strokeDasharray="2 2" />
              <XAxis dataKey="time" stroke="#4a5568" tick={{ fontSize: 10, fill: '#718096' }} />
              <YAxis
                stroke="#4a5568"
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: '#718096' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0c1017',
                  borderColor: '#1e2633',
                  color: '#e2e8f0',
                  fontSize: '11px',
                  borderRadius: '4px',
                }}
              />
              {stopPrice && (
                <ReferenceLine
                  y={stopPrice}
                  stroke="#ff9900"
                  strokeDasharray="4 4"
                  label={{ value: `STOP ₹${stopPrice.toFixed(2)}`, fill: '#ff9900', fontSize: 10 }}
                />
              )}
              {targetPrice && (
                <ReferenceLine
                  y={targetPrice}
                  stroke="#00e5ff"
                  strokeDasharray="3 3"
                  label={{ value: `TGT1 ₹${targetPrice.toFixed(2)}`, fill: '#00e5ff', fontSize: 10 }}
                />
              )}
              <Line
                type="monotone"
                dataKey="price"
                name="Price"
                stroke="#00ff66"
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          ) : mode === 'equity_curve' ? (
            <ComposedChart data={equityData}>
              <CartesianGrid stroke="#141a24" strokeDasharray="2 2" />
              <XAxis dataKey="date" stroke="#4a5568" tick={{ fontSize: 10, fill: '#718096' }} />
              <YAxis
                stroke="#4a5568"
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: '#718096' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0c1017',
                  borderColor: '#1e2633',
                  color: '#e2e8f0',
                  fontSize: '11px',
                  borderRadius: '4px',
                }}
              />
              <Line
                type="monotone"
                dataKey="portfolio_value"
                name="14:50 EOD Paper Portfolio"
                stroke="#00ff66"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="invested_value"
                name="Invested Exposure"
                stroke="#00e5ff"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="benchmark"
                name="Initial Capital (₹10L)"
                stroke="#718096"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                dot={false}
              />
            </ComposedChart>
          ) : (
            <ComposedChart data={tftFanData}>
              <CartesianGrid stroke="#141a24" strokeDasharray="2 2" />
              <XAxis dataKey="step" stroke="#4a5568" tick={{ fontSize: 10, fill: '#718096' }} />
              <YAxis
                stroke="#4a5568"
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: '#718096' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0c1017',
                  borderColor: '#1e2633',
                  color: '#e2e8f0',
                  fontSize: '11px',
                  borderRadius: '4px',
                }}
              />
              <Area
                type="monotone"
                dataKey="p90"
                name="Bullish P90"
                stroke="#a855f7"
                fill="#a855f7"
                fillOpacity={0.15}
              />
              <Area
                type="monotone"
                dataKey="p10"
                name="Bearish P10"
                stroke="#ff9900"
                fill="#ff9900"
                fillOpacity={0.15}
              />
              <Line
                type="monotone"
                dataKey="p50"
                name="Median Alpha P50"
                stroke="#00ff66"
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Control Buttons Strip */}
      <div className="flex flex-wrap items-center justify-between text-[11px] pt-2 gap-2">
        <div className="text-gray-400">
          Strategy: Champion Flat -4.5% Stop + Skew &ge; 1.25 | Exit: +6% Tgt1 (50% Book + +1% Ratchet)
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onRatchetStop}
            className="px-2 py-0.5 bg-[#1b2a1e] text-[#00ff66] border border-[#00ff66] rounded font-bold hover:brightness-125 transition-all"
          >
            [RATCHET STOP +1%]
          </button>
          <button
            onClick={onHarvestFifty}
            className="px-2 py-0.5 bg-[#2a2412] text-[#ff9900] border border-[#ff9900] rounded font-bold hover:brightness-125 transition-all"
          >
            [HARVEST 50%]
          </button>
          <button
            onClick={onEmergencyClose}
            className="px-2 py-0.5 bg-[#331114] text-[#ff3344] border border-[#ff3344] rounded font-bold hover:brightness-125 transition-all"
          >
            [CLOSE SLOT]
          </button>
        </div>
      </div>
    </div>
  );
};
