import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import rawEquityData from '../data/equityCurveData.json';

interface EquityPoint {
  Date: string;
  Portfolio: number;
  Drawdown_Pct: number;
  Strategy_Normalized: number;
}

export const PortfolioEquityCurve: React.FC = () => {
  const [timeframe, setTimeframe] = useState<'1M' | '6M' | '1Y' | '3Y' | 'ALL'>('ALL');

  const filteredData = useMemo(() => {
    const data = rawEquityData as EquityPoint[];
    if (timeframe === 'ALL') return data;
    const countMap: Record<string, number> = {
      '1M': 22,
      '6M': 130,
      '1Y': 252,
      '3Y': 756,
    };
    const take = countMap[timeframe] || data.length;
    return data.slice(-take);
  }, [timeframe]);

  const latestPoint = rawEquityData[rawEquityData.length - 1] as EquityPoint;
  const initialPoint = rawEquityData[0] as EquityPoint;
  const netReturnPct =
    ((latestPoint.Portfolio - initialPoint.Portfolio) / initialPoint.Portfolio) * 100;

  return (
    <div className="bg-[#0a0d13] border border-[#1e2633] p-4 rounded flex flex-col font-mono text-xs shadow-inner space-y-3">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#212936] pb-3 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-[#ff9900] text-black font-extrabold px-2 py-0.5 rounded text-xs">
              PORTFOLIO AUDIT
            </span>
            <h2 className="text-base font-bold text-white tracking-wide">
              HISTORICAL OOS EQUITY CURVE &amp; UNDERWATER DRAWDOWN (CHAMPION STRATEGY)
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Strategy: Champion Flat -4.5% Stop + Asymmetric Skew &ge; 1.25 + p50 &gt; 0 (929 OOS daily sessions)
          </p>
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 bg-[#101622] p-1 rounded border border-[#1f2838]">
          {(['1M', '6M', '1Y', '3Y', 'ALL'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 text-xs rounded font-bold transition-colors ${
                timeframe === tf
                  ? 'bg-[#ff9900] text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded border-l-2 border-l-[#00ff66]">
          <div className="text-gray-400 text-[10px]">FINAL OOS EQUITY</div>
          <div className="text-sm font-extrabold text-[#00ff66] mt-0.5">
            ₹{latestPoint.Portfolio.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-gray-400">
            Initial: ₹{initialPoint.Portfolio.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded border-l-2 border-l-[#ff9900]">
          <div className="text-gray-400 text-[10px]">TOTAL OOS RETURN</div>
          <div className="text-sm font-extrabold text-[#ff9900] mt-0.5">
            +{netReturnPct.toFixed(2)}%
          </div>
          <div className="text-[10px] text-gray-400">
            Net: +₹{(latestPoint.Portfolio - initialPoint.Portfolio).toLocaleString('en-IN')}
          </div>
        </div>

        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded border-l-2 border-l-[#00e5ff]">
          <div className="text-gray-400 text-[10px]">CAGR</div>
          <div className="text-sm font-extrabold text-[#00e5ff] mt-0.5">46.79%</div>
          <div className="text-[10px] text-gray-400">Folds 0–14 OOS</div>
        </div>

        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded border-l-2 border-l-[#ff3344]">
          <div className="text-gray-400 text-[10px]">MAX DRAWDOWN</div>
          <div className="text-sm font-extrabold text-[#ff3344] mt-0.5">-16.01%</div>
          <div className="text-[10px] text-gray-400">Calmar Ratio: 2.92</div>
        </div>

        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded border-l-2 border-l-[#a855f7]">
          <div className="text-gray-400 text-[10px]">SHARPE RATIO</div>
          <div className="text-sm font-extrabold text-[#a855f7] mt-0.5">1.70</div>
          <div className="text-[10px] text-gray-400">Sortino: 2.33 | PF: 1.54</div>
        </div>

        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded border-l-2 border-l-[#eab308]">
          <div className="text-gray-400 text-[10px]">TOTAL TRADES</div>
          <div className="text-sm font-extrabold text-white mt-0.5">2,377</div>
          <div className="text-[10px] text-[#00ff66]">Win Rate: 49.05%</div>
        </div>
      </div>

      {/* Main Equity Curve Chart */}
      <div className="bg-[#05070a] border border-[#1b2330] p-2 rounded">
        <div className="flex justify-between items-center mb-1 text-[11px] text-gray-400 px-2">
          <span className="text-[#00ff66] font-bold">● PORTFOLIO CAPITAL GROWTH (INR)</span>
          <span>
            {filteredData[0]?.Date} &rarr; {filteredData[filteredData.length - 1]?.Date}
          </span>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filteredData}>
              <defs>
                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00ff66" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00ff66" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#141a24" strokeDasharray="2 2" />
              <XAxis dataKey="Date" stroke="#4a5568" tick={{ fontSize: 10, fill: '#718096' }} />
              <YAxis
                stroke="#4a5568"
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: '#718096' }}
                tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0c1017',
                  borderColor: '#1e2633',
                  color: '#e2e8f0',
                  fontSize: '11px',
                  borderRadius: '4px',
                }}
                formatter={(val: any) => [
                  `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                  'Equity',
                ]}
              />
              <Area
                type="monotone"
                dataKey="Portfolio"
                stroke="#00ff66"
                strokeWidth={2.5}
                fill="url(#equityFill)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Underwater Drawdown Chart */}
      <div className="bg-[#05070a] border border-[#1b2330] p-2 rounded">
        <div className="flex justify-between items-center mb-1 text-[11px] text-gray-400 px-2">
          <span className="text-[#ff3344] font-bold">● UNDERWATER DRAWDOWN (%)</span>
          <span>Max OOS Drawdown: -16.01%</span>
        </div>
        <div className="h-[120px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filteredData}>
              <defs>
                <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff3344" stopOpacity={0.0} />
                  <stop offset="95%" stopColor="#ff3344" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#141a24" strokeDasharray="2 2" />
              <XAxis dataKey="Date" stroke="#4a5568" tick={{ fontSize: 10, fill: '#718096' }} />
              <YAxis
                stroke="#4a5568"
                domain={[-18, 0]}
                tick={{ fontSize: 10, fill: '#718096' }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0c1017',
                  borderColor: '#1e2633',
                  color: '#ff3344',
                  fontSize: '11px',
                }}
                formatter={(val: any) => [`${val}%`, 'Drawdown']}
              />
              <ReferenceLine
                y={-16.01}
                stroke="#ff9900"
                strokeDasharray="3 3"
                label={{ value: 'MAX DD -16.01%', fill: '#ff9900', fontSize: 10 }}
              />
              <Area
                type="monotone"
                dataKey="Drawdown_Pct"
                stroke="#ff3344"
                strokeWidth={1.5}
                fill="url(#drawdownFill)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Annual Breakdown Summary */}
      <div className="grid grid-cols-4 gap-2 text-[11px]">
        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded text-center">
          <div className="text-gray-400">2023 CALENDAR</div>
          <div className="text-[#00ff66] font-bold text-sm mt-0.5">+96.17%</div>
        </div>
        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded text-center">
          <div className="text-gray-400">2024 CALENDAR</div>
          <div className="text-[#00ff66] font-bold text-sm mt-0.5">+86.88%</div>
        </div>
        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded text-center">
          <div className="text-gray-400">2025 CALENDAR</div>
          <div className="text-[#00ff66] font-bold text-sm mt-0.5">+6.37%</div>
        </div>
        <div className="bg-[#0c1118] border border-[#1e2633] p-2 rounded text-center">
          <div className="text-gray-400">2026 YTD (TO OCT)</div>
          <div className="text-[#00ff66] font-bold text-sm mt-0.5">+6.50%</div>
        </div>
      </div>
    </div>
  );
};
