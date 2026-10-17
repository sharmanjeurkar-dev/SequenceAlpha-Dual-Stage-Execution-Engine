import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

export interface HourlyChartPoint {
  time: string;
  shortTime?: string;
  price: number;
  ema?: number;
  volume?: number;
  isUp?: boolean;
  stop?: number;
  target?: number;
}

interface ChartProps {
  mode: 'slot_trail' | 'equity_curve' | 'tft_fan';
  onSetMode: (mode: 'slot_trail' | 'equity_curve' | 'tft_fan') => void;
  symbol: string;
  slotPriceData: HourlyChartPoint[];
  equityData: Array<{ date: string; portfolio_value: number; invested_value: number; benchmark: number }>;
  tftFanData: Array<{ step: string; p10: number; p50: number; p90: number }>;
  stopPrice?: number;
  targetPrice?: number;
  entryPrice?: number;
  ltp?: number;
  pnlPct?: number;
  holdingBar?: number;
  shares?: number;
  lastTickTime?: string;
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
  shares = 1,
  lastTickTime,
  onRatchetStop,
  onHarvestFifty,
  onEmergencyClose,
}) => {
  const chartData = React.useMemo(() => {
    if (!slotPriceData || slotPriceData.length === 0) return [];
    const copy = [...slotPriceData];
    const lastIdx = copy.length - 1;
    const prevIdx = Math.max(0, lastIdx - 1);
    const livePx = ltp && ltp > 0 ? ltp : copy[lastIdx].price;
    copy[lastIdx] = {
      ...copy[lastIdx],
      price: livePx,
      isUp: livePx >= copy[prevIdx].price,
    };
    return copy;
  }, [slotPriceData, ltp]);

  const latestBar = chartData[chartData.length - 1];
  const prevBar = chartData[chartData.length - 2] || latestBar;
  const currentLtp = ltp || latestBar?.price || 0;

  // Determine uni-color (Green vs Red) from the 1-hour bar trend
  const hourlyBarDelta = latestBar && prevBar ? currentLtp - prevBar.price : 0;
  const isHourlyUp = hourlyBarDelta >= 0;
  const lineUniColor = isHourlyUp ? '#00ff66' : '#ff3344';

  const barChange = prevBar ? currentLtp - prevBar.price : 0;
  const barChangePct =
    prevBar && prevBar.price > 0 ? (barChange / prevBar.price) * 100 : 0;
  const displayChangePct =
    typeof pnlPct === 'number' && Math.abs(pnlPct) >= 0.01 ? pnlPct : barChangePct;
  const displayChangeAbs =
    entryPrice && Math.abs(currentLtp - entryPrice) >= 0.01
      ? currentLtp - entryPrice
      : barChange;
  const currentEma =
    latestBar?.ema || (entryPrice ? Number((entryPrice * 0.985).toFixed(2)) : 0);
  const currentVol = latestBar?.volume || 456;

  // Auto-fit Y-axis domain to the 1H chart series + live LTP (like TradingView auto-scale)
  const allPrices = chartData.map((d) => d.price).filter((p) => p > 0);
  if (currentLtp > 0) allPrices.push(currentLtp);
  const minPx = allPrices.length > 0 ? Math.min(...allPrices) : 90;
  const maxPx = allPrices.length > 0 ? Math.max(...allPrices) : 110;
  const pad = Math.max((maxPx - minPx) * 0.08, maxPx * 0.004);
  const yDomain: [number, number] = [
    Number((minPx - pad).toFixed(2)),
    Number((maxPx + pad).toFixed(2)),
  ];

  const maxVol = Math.max(...chartData.map((d) => d.volume || 100), 1000);

  // Render a glowing pulsing dot on the rightmost 1H bar synced to live LTP
  const renderLiveEndpointDot = (props: any) => {
    const { cx, cy, index } = props;
    if (index === chartData.length - 1 && cx && cy) {
      return (
        <g key={`live-dot-${index}`}>
          <circle cx={cx} cy={cy} r={6} fill={lineUniColor} fillOpacity={0.28} />
          <circle cx={cx} cy={cy} r={3} fill={lineUniColor} stroke="#050608" strokeWidth={1} />
        </g>
      );
    }
    return <g key={`empty-dot-${index}`} />;
  };

  const targetPnlInr =
    targetPrice && entryPrice ? ((targetPrice - entryPrice) * shares).toFixed(1) : '0.0';
  const livePnlInr =
    currentLtp && entryPrice ? ((currentLtp - entryPrice) * shares).toFixed(1) : '0.0';
  const stopPnlInr =
    stopPrice && entryPrice ? ((stopPrice - entryPrice) * shares).toFixed(1) : '0.0';

  return (
    <div className="bg-[#080a0f] border border-[#1e2633] p-2.5 rounded flex flex-col font-mono text-xs shadow-inner">
      {/* Top Toolbar (TradingView / Fyers style) */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#181f2c] pb-2 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[#ff9900] font-bold">CHART.VIEW</span>
          <span className="text-white font-bold">{symbol.replace('NSE:', '')}</span>
          <span className="text-[11px] text-gray-300 bg-[#131924] px-1.5 py-0.5 rounded border border-[#263144]">
            1h · NSE
          </span>
          <span className="text-[10px] text-[#00ff66] bg-[#0c1f13] px-1.5 py-0.5 rounded border border-[#00ff66]/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff66] animate-ping" />
            <span>LIVE {lastTickTime ? lastTickTime : '1.5s'}</span>
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
            1H LINE CHART
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

      {/* Main TradingView / Fyers Canvas */}
      <div className="relative w-full h-[360px] bg-[#050608] border border-[#161d28] rounded-sm mt-2 overflow-hidden">
        {/* Top-Left TradingView / Fyers Overlay Legend */}
        {mode === 'slot_trail' && (
          <div className="absolute top-2 left-3 z-10 pointer-events-none space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-xs tracking-wide">
                {symbol.replace('NSE:', '').replace('-EQ', '')} · 1h · NSE
              </span>
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: lineUniColor }}
              />
              <span className="font-bold text-xs" style={{ color: lineUniColor }}>
                ₹{currentLtp.toFixed(2)}{' '}
                <span>
                  {displayChangeAbs >= 0 ? '+' : ''}
                  {displayChangeAbs.toFixed(2)} ({displayChangePct >= 0 ? '+' : ''}
                  {displayChangePct.toFixed(2)}%)
                </span>
              </span>
            </div>

            <div className="text-[10px] text-gray-400 space-y-0.5 pt-0.5">
              <div>
                Volume <span className="text-[#10b981] font-bold">{currentVol.toLocaleString()}</span>
              </div>
              <div>
                EMA <span className="text-gray-500">200 close</span>{' '}
                <span className="text-[#38bdf8] font-bold">{currentEma.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <ResponsiveContainer width="100%" height="100%">
          {mode === 'slot_trail' ? (
            <ComposedChart
              data={chartData}
              margin={{ top: 18, right: 62, left: 6, bottom: 5 }}
            >
              <CartesianGrid stroke="#111622" strokeDasharray="1 1" />

              <XAxis
                dataKey="time"
                stroke="#2d3748"
                tick={{ fontSize: 10, fill: '#718096' }}
                minTickGap={36}
                tickFormatter={(val: string) => {
                  const parts = String(val).split(' ');
                  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : val;
                }}
              />

              {/* Right-hand Price Y-Axis like TradingView */}
              <YAxis
                yAxisId="price"
                orientation="right"
                stroke="#2d3748"
                domain={yDomain}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickFormatter={(v) => Number(v).toFixed(2)}
                width={56}
              />

              {/* Hidden Volume Y-Axis scaled so volume bars sit in bottom 18% of canvas */}
              <YAxis
                yAxisId="vol"
                orientation="left"
                domain={[0, maxVol * 5.5]}
                hide
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: '#0b0f17',
                  borderColor: '#263144',
                  color: '#e2e8f0',
                  fontSize: '11px',
                  borderRadius: '4px',
                }}
                formatter={(val: any, name: any) => {
                  if (name === 'Volume') return [Number(val).toLocaleString(), 'Volume'];
                  return [`₹${Number(val).toFixed(2)}`, name];
                }}
              />

              {/* Bottom Green/Red Volume Histogram Bars */}
              <Bar
                yAxisId="vol"
                dataKey="volume"
                name="Volume"
                barSize={4}
                isAnimationActive={false}
              >
                {chartData.map((entry, idx) => (
                  <Cell
                    key={`vol-cell-${idx}`}
                    fill={entry.isUp !== false ? '#10b981' : '#ef4444'}
                    fillOpacity={0.5}
                  />
                ))}
              </Bar>

              {/* Horizontal Live LTP Laser Line (moves on every live tick) */}
              {currentLtp > 0 && (
                <ReferenceLine
                  yAxisId="price"
                  y={currentLtp}
                  stroke={lineUniColor}
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                  label={{
                    position: 'insideTopRight',
                    value: `LIVE ₹${currentLtp.toFixed(2)}`,
                    fill: lineUniColor,
                    fontSize: 10,
                  }}
                />
              )}

              {/* Target 1 (+6%) Green Line */}
              {targetPrice && (
                <ReferenceLine
                  yAxisId="price"
                  y={targetPrice}
                  stroke="#10b981"
                  strokeWidth={1}
                  label={{
                    position: 'insideTopLeft',
                    value: `TGT1 +₹${targetPnlInr} (${targetPrice.toFixed(2)})`,
                    fill: '#10b981',
                    fontSize: 10,
                  }}
                />
              )}

              {/* Entry Price Blue Line */}
              {entryPrice && (
                <ReferenceLine
                  yAxisId="price"
                  y={entryPrice}
                  stroke="#3b82f6"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  label={{
                    position: 'insideLeft',
                    value: `ENTRY ${Number(livePnlInr) >= 0 ? '+' : ''}₹${livePnlInr} (${entryPrice.toFixed(2)})`,
                    fill: '#60a5fa',
                    fontSize: 10,
                  }}
                />
              )}

              {/* Stop Loss Orange Line */}
              {stopPrice && (
                <ReferenceLine
                  yAxisId="price"
                  y={stopPrice}
                  stroke="#f59e0b"
                  strokeWidth={1}
                  label={{
                    position: 'insideBottomLeft',
                    value: `STOP ₹${stopPnlInr} (${stopPrice.toFixed(2)})`,
                    fill: '#f59e0b',
                    fontSize: 10,
                  }}
                />
              )}

              {/* Smooth Light-Blue 200 EMA Line */}
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="ema"
                name="EMA 200"
                stroke="#38bdf8"
                strokeWidth={1.3}
                dot={false}
                isAnimationActive={false}
              />

              {/* Uni-Color Sharp Linear Jagged Price Line (Green if 1H up, Red if 1H down) */}
              <Line
                yAxisId="price"
                type="linear"
                dataKey="price"
                name="Price (1H)"
                stroke={lineUniColor}
                strokeWidth={1.85}
                dot={renderLiveEndpointDot}
                isAnimationActive={false}
              />
            </ComposedChart>
          ) : mode === 'equity_curve' ? (
            <ComposedChart data={equityData} margin={{ top: 15, right: 55, left: 6, bottom: 5 }}>
              <CartesianGrid stroke="#141a24" strokeDasharray="2 2" />
              <XAxis dataKey="date" stroke="#4a5568" tick={{ fontSize: 10, fill: '#718096' }} />
              <YAxis
                orientation="right"
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
                type="linear"
                dataKey="portfolio_value"
                name="14:50 EOD Paper Portfolio"
                stroke="#a855f7"
                strokeWidth={2}
                dot={{ r: 2.5, fill: '#a855f7' }}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="invested_value"
                name="Invested Exposure"
                stroke="#38bdf8"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="benchmark"
                name="Initial Capital (₹10L)"
                stroke="#718096"
                strokeDasharray="3 3"
                strokeWidth={1.2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          ) : (
            <ComposedChart data={tftFanData} margin={{ top: 15, right: 55, left: 6, bottom: 5 }}>
              <CartesianGrid stroke="#141a24" strokeDasharray="2 2" />
              <XAxis dataKey="step" stroke="#4a5568" tick={{ fontSize: 10, fill: '#718096' }} />
              <YAxis
                orientation="right"
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
                type="linear"
                dataKey="p90"
                name="Bullish P90"
                stroke="#a855f7"
                fill="#a855f7"
                fillOpacity={0.15}
                isAnimationActive={false}
              />
              <Area
                type="linear"
                dataKey="p10"
                name="Bearish P10"
                stroke="#ff9900"
                fill="#ff9900"
                fillOpacity={0.15}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="p50"
                name="Median Alpha P50"
                stroke="#00ff66"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Bottom Status & Action Bar */}
      <div className="flex flex-wrap items-center justify-between text-[11px] pt-2 gap-2">
        <div className="flex items-center gap-3 text-gray-400">
          <span>
            LTP: <strong className="text-[#c084fc]">₹{currentLtp.toFixed(2)}</strong>
          </span>
          <span>
            Entry: <strong className="text-[#38bdf8]">₹{entryPrice ? entryPrice.toFixed(2) : '--'}</strong>
          </span>
          <span>
            Gain:{' '}
            <strong className={(pnlPct || 0) >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}>
              {(pnlPct || 0) >= 0 ? '+' : ''}
              {(pnlPct || 0).toFixed(2)}%
            </strong>
          </span>
          <span>
            Bar: <strong className="text-white">{holdingBar}/5</strong>
          </span>
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
