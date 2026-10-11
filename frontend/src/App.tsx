import React, { useState } from 'react';
import { BloombergHeader } from './components/BloombergHeader';
import { TickerTape } from './components/TickerTape';
import { KpiSummaryStrip } from './components/KpiSummaryStrip';
import { RechartsFinancialChart } from './components/RechartsFinancialChart';
import { TrancheMatrix } from './components/TrancheMatrix';
import { DualAccountComparator } from './components/DualAccountComparator';
import { OrderBlotter } from './components/OrderBlotter';
import { TftQuantileMatrix } from './components/TftQuantileMatrix';
import { PortfolioEquityCurve } from './components/PortfolioEquityCurve';
import { TerminalCommandLine } from './components/TerminalCommandLine';
import { useWebSocketStream } from './hooks/useWebSocketStream';
import type {
  TrancheSlot,
  DualAccountMetrics,
  FyersOrder,
  TftQuantileInference,
  TickerItem,
} from './types/portfolio';

export const App: React.FC = () => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'slots' | 'equity' | 'dual' | 'tft' | 'blotter'>(
    'dashboard'
  );
  const [chartMode, setChartMode] = useState<'slot_trail' | 'equity_curve' | 'tft_fan'>('slot_trail');
  const [selectedSlotId, setSelectedSlotId] = useState<number>(0);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);

  // Financial State
  const [totalAum] = useState<number>(1004213.61);
  const [cashBuffer] = useState<number>(546810.77);
  const [accountAValue] = useState<number>(1004213.61);
  const [accountBValue] = useState<number>(1003632.95);

  // Real-time WebSocket connection to SequenceAlpha Python engine
  const { isConnected: wsConnected, sendCommand } = useWebSocketStream({
    url: 'ws://localhost:8765/ws',
    onStateUpdate: (msg) => {
      if (msg.type === 'TICK_UPDATE') {
        // Automatically sync state when python backend is running
      }
    },
  });

  // Ticker stream items
  const [tickerItems] = useState<TickerItem[]>([
    { symbol: 'NIFTY 50', price: 25124.5, change_pct: 0.34, up: true },
    { symbol: 'BANKNIFTY', price: 51890.1, change_pct: -0.12, up: false },
    { symbol: 'NSE:INDOTHAI-EQ', price: 40.71, change_pct: 10.21, up: true },
    { symbol: 'NSE:RESPONIND-EQ', price: 161.8, change_pct: 1.3, up: true },
    { symbol: 'NSE:MANALIPETC-EQ', price: 84.15, change_pct: 3.25, up: true },
    { symbol: 'NSE:VINDHYATEL-EQ', price: 2450.0, change_pct: 1.66, up: true },
    { symbol: 'NSE:SUPERHOUSE-EQ', price: 231.8, change_pct: 2.16, up: true },
    { symbol: 'NSE:SHREDIGCEM-EQ', price: 62.4, change_pct: -0.64, up: false },
    { symbol: 'NSE:ALOKINDS-EQ', price: 24.3, change_pct: -1.22, up: false },
    { symbol: 'NSE:DCW-EQ', price: 56.1, change_pct: 3.51, up: true },
  ]);

  // 15 Tranche Slots
  const [slots, setSlots] = useState<TrancheSlot[]>([
    {
      slot_id: 0,
      symbol: 'NSE:INDOTHAI-EQ',
      entry_date: '2026-10-05',
      entry_price: 36.94,
      ltp: 40.71,
      current_shares: 724,
      original_shares: 1447,
      peak_price: 40.71,
      peak_gain: 0.102,
      target_hit: true,
      stop_price: 37.31,
      holding_bar: 2,
      expiry_bar: 5,
      volatility_20d: 0.025,
      pnl_pct: 10.21,
    },
    {
      slot_id: 1,
      symbol: 'NSE:RESPONIND-EQ',
      entry_date: '2026-10-07',
      entry_price: 159.73,
      ltp: 161.8,
      current_shares: 492,
      original_shares: 492,
      peak_price: 161.8,
      peak_gain: 0.013,
      target_hit: false,
      stop_price: 152.54,
      holding_bar: 1,
      expiry_bar: 5,
      volatility_20d: 0.031,
      pnl_pct: 1.3,
    },
    {
      slot_id: 2,
      symbol: 'NSE:MANALIPETC-EQ',
      entry_date: '2026-10-06',
      entry_price: 81.5,
      ltp: 84.15,
      current_shares: 960,
      original_shares: 960,
      peak_price: 84.15,
      peak_gain: 0.0325,
      target_hit: false,
      stop_price: 77.85,
      holding_bar: 2,
      expiry_bar: 5,
      volatility_20d: 0.028,
      pnl_pct: 3.25,
    },
    {
      slot_id: 3,
      symbol: 'NSE:VINDHYATEL-EQ',
      entry_date: '2026-10-06',
      entry_price: 2410.0,
      ltp: 2450.0,
      current_shares: 32,
      original_shares: 32,
      peak_price: 2450.0,
      peak_gain: 0.0166,
      target_hit: false,
      stop_price: 2301.5,
      holding_bar: 2,
      expiry_bar: 5,
      volatility_20d: 0.027,
      pnl_pct: 1.66,
    },
    {
      slot_id: 4,
      symbol: 'NSE:SUPERHOUSE-EQ',
      entry_date: '2026-10-05',
      entry_price: 226.9,
      ltp: 231.8,
      current_shares: 345,
      original_shares: 345,
      peak_price: 231.8,
      peak_gain: 0.0216,
      target_hit: false,
      stop_price: 216.7,
      holding_bar: 3,
      expiry_bar: 5,
      volatility_20d: 0.03,
      pnl_pct: 2.16,
    },
    {
      slot_id: 5,
      symbol: 'NSE:SHREDIGCEM-EQ',
      entry_date: '2026-10-07',
      entry_price: 62.8,
      ltp: 62.4,
      current_shares: 1250,
      original_shares: 1250,
      peak_price: 62.8,
      peak_gain: 0.0,
      target_hit: false,
      stop_price: 59.95,
      holding_bar: 1,
      expiry_bar: 5,
      volatility_20d: 0.029,
      pnl_pct: -0.64,
    },
    {
      slot_id: 6,
      symbol: 'NSE:ALOKINDS-EQ',
      entry_date: '2026-10-05',
      entry_price: 24.6,
      ltp: 24.3,
      current_shares: 3200,
      original_shares: 3200,
      peak_price: 24.6,
      peak_gain: 0.0,
      target_hit: false,
      stop_price: 23.5,
      holding_bar: 3,
      expiry_bar: 5,
      volatility_20d: 0.033,
      pnl_pct: -1.22,
    },
    {
      slot_id: 7,
      symbol: 'NSE:DCW-EQ',
      entry_date: '2026-10-06',
      entry_price: 54.2,
      ltp: 56.1,
      current_shares: 1450,
      original_shares: 1450,
      peak_price: 56.1,
      peak_gain: 0.0351,
      target_hit: false,
      stop_price: 51.75,
      holding_bar: 2,
      expiry_bar: 5,
      volatility_20d: 0.026,
      pnl_pct: 3.51,
    },
    ...Array.from({ length: 7 }, (_, i) => ({
      slot_id: i + 8,
      symbol: null,
      entry_date: null,
      entry_price: 0,
      ltp: 0,
      current_shares: 0,
      original_shares: 0,
      peak_price: 0,
      peak_gain: 0,
      target_hit: false,
      stop_price: 0,
      holding_bar: 0,
      expiry_bar: 5,
      volatility_20d: 0,
      pnl_pct: 0,
    })),
  ]);

  // Order Blotter
  const [orders, setOrders] = useState<FyersOrder[]>([
    {
      order_id: 'FY-90214',
      timestamp: '15:05:01',
      account: 'ACCT_A',
      symbol: 'NSE:RESPONIND-EQ',
      side: 'BUY',
      order_type: 'MKT',
      quantity: 492,
      fill_price: 159.73,
      slippage_bps: 3.2,
      strategy_tag: 'COHORT_ENTRY',
      status: 'FILLED',
    },
    {
      order_id: 'FY-90188',
      timestamp: '14:52:10',
      account: 'ACCT_A',
      symbol: 'NSE:INDOTHAI-EQ',
      side: 'SELL',
      order_type: 'LMT',
      quantity: 723,
      fill_price: 39.16,
      slippage_bps: 0.0,
      strategy_tag: 'TARGET_1_EXIT',
      status: 'FILLED',
    },
    {
      order_id: 'FY-90150',
      timestamp: '14:50:00',
      account: 'ACCT_A',
      symbol: 'NSE:SHREDIGCEM-EQ',
      side: 'BUY',
      order_type: 'MKT',
      quantity: 1250,
      fill_price: 62.8,
      slippage_bps: 4.1,
      strategy_tag: 'COHORT_ENTRY',
      status: 'FILLED',
    },
    {
      order_id: 'FY-89942',
      timestamp: '09:20:15',
      account: 'ACCT_B',
      symbol: 'NSE:MANALIPETC-EQ',
      side: 'BUY',
      order_type: 'MKT',
      quantity: 960,
      fill_price: 81.5,
      slippage_bps: 6.8,
      strategy_tag: 'COHORT_ENTRY',
      status: 'FILLED',
    },
  ]);

  // Dual Account Historical Comparisons
  const [metricsHistory] = useState<DualAccountMetrics[]>([
    {
      date: '2026-10-05',
      account_a_value: 999405.25,
      account_b_value: 1000000.0,
      account_a_pnl_day: -594.75,
      account_b_pnl_day: 0.0,
      account_a_cum_return_pct: -0.06,
      account_b_cum_return_pct: 0.0,
      account_a_active_slots: 3,
      account_b_active_slots: 0,
      account_a_win_rate_pct: 0.0,
      account_b_win_rate_pct: 0.0,
      leader: 'Account B (Morning)',
    },
    {
      date: '2026-10-06',
      account_a_value: 1007052.0,
      account_b_value: 1007168.93,
      account_a_pnl_day: 6027.62,
      account_b_pnl_day: 6612.76,
      account_a_cum_return_pct: 0.71,
      account_b_cum_return_pct: 0.72,
      account_a_active_slots: 6,
      account_b_active_slots: 3,
      account_a_win_rate_pct: 100.0,
      account_b_win_rate_pct: 100.0,
      leader: 'Account B (Morning)',
    },
    {
      date: '2026-10-07',
      account_a_value: 1004213.61,
      account_b_value: 1003937.45,
      account_a_pnl_day: -2930.5,
      account_b_pnl_day: -2640.32,
      account_a_cum_return_pct: 0.42,
      account_b_cum_return_pct: 0.39,
      account_a_active_slots: 8,
      account_b_active_slots: 5,
      account_a_win_rate_pct: 66.67,
      account_b_win_rate_pct: 66.67,
      leader: 'Account A (14:50 EOD)',
    },
    {
      date: '2026-10-08',
      account_a_value: 1004213.61,
      account_b_value: 1003632.95,
      account_a_pnl_day: 0.0,
      account_b_pnl_day: -304.5,
      account_a_cum_return_pct: 0.42,
      account_b_cum_return_pct: 0.36,
      account_a_active_slots: 8,
      account_b_active_slots: 8,
      account_a_win_rate_pct: 66.67,
      account_b_win_rate_pct: 66.67,
      leader: 'Account A (14:50 EOD)',
    },
  ]);

  // TFT Model Candidates
  const [candidates] = useState<TftQuantileInference[]>([
    {
      symbol: 'NSE:INDOTHAI-EQ',
      p10_bearish: -0.015,
      p50_median_alpha: 0.048,
      p90_bullish_breakout: 0.092,
      conviction_score: 0.89,
      directional_loss: 0.071,
      decile_rank: 10,
    },
    {
      symbol: 'NSE:RESPONIND-EQ',
      p10_bearish: -0.011,
      p50_median_alpha: 0.039,
      p90_bullish_breakout: 0.078,
      conviction_score: 0.84,
      directional_loss: 0.082,
      decile_rank: 10,
    },
    {
      symbol: 'NSE:MANALIPETC-EQ',
      p10_bearish: -0.009,
      p50_median_alpha: 0.034,
      p90_bullish_breakout: 0.065,
      conviction_score: 0.81,
      directional_loss: 0.089,
      decile_rank: 10,
    },
  ]);

  // Active Slot Data
  const activeSlot = slots[selectedSlotId] || slots[0];

  const slotPriceData = Array.from({ length: 25 }, (_, i) => {
    const base = activeSlot.entry_price || 100;
    const factor = 1 + (Math.sin(i / 3) * 0.04 + i * 0.003);
    const p = Number((base * factor).toFixed(2));
    return {
      time: `15:${(i * 2).toString().padStart(2, '0')}`,
      price: i === 24 ? activeSlot.ltp || p : p,
      stop: activeSlot.stop_price,
      target: Number((activeSlot.entry_price * 1.06).toFixed(2)),
    };
  });

  const equityData = [
    { date: '10-04', account_a: 1000000, account_b: 1000000, benchmark: 1000000 },
    { date: '10-05', account_a: 999405, account_b: 1000000, benchmark: 1000500 },
    { date: '10-06', account_a: 1007052, account_b: 1007168, benchmark: 1001200 },
    { date: '10-07', account_a: 1004213, account_b: 1003937, benchmark: 1001800 },
    { date: '10-08', account_a: 1004213, account_b: 1003632, benchmark: 1002200 },
  ];

  const tftFanData = Array.from({ length: 15 }, (_, i) => ({
    step: `+${i + 1}d`,
    p10: Number((100 - i * 0.8).toFixed(1)),
    p50: Number((100 + i * 1.4).toFixed(1)),
    p90: Number((100 + i * 3.2).toFixed(1)),
  }));

  // Handlers
  const handleSelectSlot = (slotId: number) => {
    setSelectedSlotId(slotId);
  };

  const handleRatchetStop = (slotId: number = selectedSlotId) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.slot_id === slotId && s.symbol) {
          const newStop = Number((s.stop_price * 1.015).toFixed(2));
          return { ...s, stop_price: newStop };
        }
        return s;
      })
    );
    sendCommand('RATCHET', { slot_id: slotId });
  };

  const handleHarvestFifty = () => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.slot_id === selectedSlotId && s.symbol && !s.target_hit) {
          const newShares = Math.floor(s.current_shares / 2);
          const newOrder: FyersOrder = {
            order_id: `FY-${Math.floor(10000 + Math.random() * 90000)}`,
            timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
            account: 'ACCT_A',
            symbol: s.symbol,
            side: 'SELL',
            order_type: 'MKT',
            quantity: newShares,
            fill_price: s.ltp,
            slippage_bps: 1.5,
            strategy_tag: 'TARGET_1_EXIT',
            status: 'FILLED',
          };
          setOrders((o) => [newOrder, ...o]);
          sendCommand('HARVEST_50', { slot_id: selectedSlotId, shares: newShares });
          return { ...s, target_hit: true, current_shares: newShares };
        }
        return s;
      })
    );
  };

  const handleEmergencyClose = (slotId: number = selectedSlotId) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.slot_id === slotId && s.symbol) {
          const newOrder: FyersOrder = {
            order_id: `FY-${Math.floor(10000 + Math.random() * 90000)}`,
            timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
            account: 'ACCT_A',
            symbol: s.symbol,
            side: 'SELL',
            order_type: 'MKT',
            quantity: s.current_shares,
            fill_price: s.ltp,
            slippage_bps: 3.5,
            strategy_tag: 'MANUAL',
            status: 'FILLED',
          };
          setOrders((o) => [newOrder, ...o]);
          sendCommand('CLOSE_SLOT', { slot_id: slotId });
          return {
            ...s,
            symbol: null,
            entry_price: 0,
            ltp: 0,
            current_shares: 0,
            original_shares: 0,
            target_hit: false,
            stop_price: 0,
            pnl_pct: 0,
          };
        }
        return s;
      })
    );
  };

  const handleSimulateFill = () => {
    const syms = ['NSE:INDOTHAI-EQ', 'NSE:RESPONIND-EQ', 'NSE:VINDHYATEL-EQ', 'NSE:DCW-EQ'];
    const sym = syms[Math.floor(Math.random() * syms.length)];
    const fillPrice = Number((40 + Math.random() * 120).toFixed(2));
    const newOrder: FyersOrder = {
      order_id: `FY-${Math.floor(10000 + Math.random() * 90000)}`,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
      account: Math.random() > 0.5 ? 'ACCT_A' : 'ACCT_B',
      symbol: sym,
      side: Math.random() > 0.5 ? 'BUY' : 'SELL',
      order_type: 'MKT',
      quantity: 100,
      fill_price: fillPrice,
      slippage_bps: 2.8,
      strategy_tag: 'COHORT_ENTRY',
      status: 'FILLED',
    };
    setOrders((prev) => [newOrder, ...prev]);
  };

  const handleExecuteCommand = (cmd: string) => {
    const upper = cmd.trim().toUpperCase();
    if (upper === 'HELP') {
      alert(
        'COMMANDS:\n- BUY [SYM] [QTY]\n- RATCHET [SLOT]\n- CLOSE [SLOT]\n- EQUITY / SLOTS / DUAL / TFT / BLOTTER\n- HALT'
      );
    } else if (upper.startsWith('BUY')) {
      const parts = upper.split(' ');
      const sym = parts[1] || 'NSE:TATAPOWER-EQ';
      const qty = parseInt(parts[2]) || 100;
      const emptySlot = slots.find((s) => !s.symbol);
      if (emptySlot) {
        setSlots((prev) =>
          prev.map((s) =>
            s.slot_id === emptySlot.slot_id
              ? {
                  ...s,
                  symbol: sym,
                  entry_price: 150.0,
                  ltp: 150.0,
                  current_shares: qty,
                  original_shares: qty,
                  stop_price: 142.5,
                  pnl_pct: 0.0,
                }
              : s
          )
        );
        sendCommand('BUY', { symbol: sym, quantity: qty });
      }
    } else if (upper.startsWith('RATCHET')) {
      handleRatchetStop();
    } else if (upper === 'EQUITY') {
      setActiveTab('equity');
    } else if (upper === 'HALT') {
      sendCommand('HALT');
      alert('CIRCUIT BREAKER: Execution halted.');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#030508] text-[#e6edf3] font-mono select-none">
      {/* 1. Header */}
      <BloombergHeader
        wsConnected={wsConnected}
        regime="BULLISH / VOL-LOW"
        engineArmed={true}
        audioEnabled={audioEnabled}
        onToggleAudio={() => setAudioEnabled(!audioEnabled)}
      />

      {/* 2. Marquee Ticker */}
      <TickerTape
        items={tickerItems}
        onSelectSymbol={(sym) => {
          const found = slots.find((s) => s.symbol === sym);
          if (found) setSelectedSlotId(found.slot_id);
        }}
      />

      {/* 3. Financial KPI Strip */}
      <KpiSummaryStrip
        totalAum={totalAum}
        aumPct={0.42}
        maxDrawdown={15.75}
        sharpeRatio={1.53}
        accountAValue={accountAValue}
        accountBValue={accountBValue}
        activeSlotsCount={slots.filter((s) => s.symbol).length}
        cashBuffer={cashBuffer}
        decileSpread={3.8}
        directionalLoss={0.0821}
      />

      {/* 4. Function Hotkeys Navigation */}
      <nav className="bg-[#111620] border-b border-[#212936] px-3 py-1 flex items-center justify-between text-xs overflow-x-auto">
        <div className="flex items-center gap-1 font-mono">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-2.5 py-1 rounded-sm border font-bold transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-[#ff9900] text-black border-[#ff9900]'
                : 'bg-[#161d27] text-gray-300 border-[#263140] hover:text-white'
            }`}
          >
            &lt;F1&gt; TERMINAL MATRIX
          </button>
          <button
            onClick={() => setActiveTab('slots')}
            className={`px-2.5 py-1 rounded-sm border font-bold transition-colors ${
              activeTab === 'slots'
                ? 'bg-[#ff9900] text-black border-[#ff9900]'
                : 'bg-[#161d27] text-gray-300 border-[#263140] hover:text-white'
            }`}
          >
            &lt;F2&gt; 15-SLOT TRANCHES
          </button>
          <button
            onClick={() => setActiveTab('equity')}
            className={`px-2.5 py-1 rounded-sm border font-bold transition-colors ${
              activeTab === 'equity'
                ? 'bg-[#00ff66] text-black border-[#00ff66]'
                : 'bg-[#161d27] text-[#00ff66] border-[#263140] hover:text-white'
            }`}
          >
            &lt;F3&gt; PORTFOLIO EQUITY CURVE
          </button>
          <button
            onClick={() => setActiveTab('dual')}
            className={`px-2.5 py-1 rounded-sm border font-bold transition-colors ${
              activeTab === 'dual'
                ? 'bg-[#ff9900] text-black border-[#ff9900]'
                : 'bg-[#161d27] text-gray-300 border-[#263140] hover:text-white'
            }`}
          >
            &lt;F4&gt; DUAL ACCT ARB (A vs B)
          </button>
          <button
            onClick={() => setActiveTab('tft')}
            className={`px-2.5 py-1 rounded-sm border font-bold transition-colors ${
              activeTab === 'tft'
                ? 'bg-[#ff9900] text-black border-[#ff9900]'
                : 'bg-[#161d27] text-gray-300 border-[#263140] hover:text-white'
            }`}
          >
            &lt;F5&gt; TFT QUANTILE ALPHA
          </button>
          <button
            onClick={() => setActiveTab('blotter')}
            className={`px-2.5 py-1 rounded-sm border font-bold transition-colors ${
              activeTab === 'blotter'
                ? 'bg-[#ff9900] text-black border-[#ff9900]'
                : 'bg-[#161d27] text-gray-300 border-[#263140] hover:text-white'
            }`}
          >
            &lt;F6&gt; ORDER BLOTTER
          </button>
        </div>
      </nav>

      {/* 5. Main Tab Content */}
      <main className="flex-1 p-2 space-y-2 bg-[#040609]">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-12 gap-2">
            {/* Chart (7 cols) */}
            <div className="col-span-12 lg:col-span-7">
              <RechartsFinancialChart
                mode={chartMode}
                onSetMode={setChartMode}
                symbol={activeSlot.symbol || 'NSE:INDOTHAI-EQ'}
                slotPriceData={slotPriceData}
                equityData={equityData}
                tftFanData={tftFanData}
                stopPrice={activeSlot.stop_price}
                targetPrice={
                  activeSlot.entry_price
                    ? Number((activeSlot.entry_price * 1.06).toFixed(2))
                    : undefined
                }
                entryPrice={activeSlot.entry_price}
                ltp={activeSlot.ltp}
                pnlPct={activeSlot.pnl_pct}
                onRatchetStop={() => handleRatchetStop(selectedSlotId)}
                onHarvestFifty={handleHarvestFifty}
                onEmergencyClose={() => handleEmergencyClose(selectedSlotId)}
              />
            </div>

            {/* Tranches Monitor (5 cols) */}
            <div className="col-span-12 lg:col-span-5">
              <TrancheMatrix
                slots={slots}
                selectedSlotId={selectedSlotId}
                onSelectSlot={handleSelectSlot}
                onRatchetStop={handleRatchetStop}
                onEmergencyClose={handleEmergencyClose}
              />
            </div>

            {/* Order Blotter (7 cols) */}
            <div className="col-span-12 lg:col-span-7">
              <OrderBlotter orders={orders} onSimulateFill={handleSimulateFill} />
            </div>

            {/* Dual Account Comparator (5 cols) */}
            <div className="col-span-12 lg:col-span-5">
              <DualAccountComparator
                metricsHistory={metricsHistory}
                accountAValue={accountAValue}
                accountBValue={accountBValue}
              />
            </div>
          </div>
        )}

        {/* Dedicated Equity Curve View */}
        {activeTab === 'equity' && (
          <div className="p-1">
            <PortfolioEquityCurve />
          </div>
        )}

        {activeTab === 'slots' && (
          <div className="p-2">
            <TrancheMatrix
              slots={slots}
              selectedSlotId={selectedSlotId}
              onSelectSlot={handleSelectSlot}
              onRatchetStop={handleRatchetStop}
              onEmergencyClose={handleEmergencyClose}
            />
          </div>
        )}

        {activeTab === 'dual' && (
          <div className="p-2">
            <DualAccountComparator
              metricsHistory={metricsHistory}
              accountAValue={accountAValue}
              accountBValue={accountBValue}
            />
          </div>
        )}

        {activeTab === 'tft' && (
          <div className="p-2">
            <TftQuantileMatrix candidates={candidates} />
          </div>
        )}

        {activeTab === 'blotter' && (
          <div className="p-2">
            <OrderBlotter orders={orders} onSimulateFill={handleSimulateFill} />
          </div>
        )}
      </main>

      {/* 6. Bloomberg Command Line */}
      <TerminalCommandLine
        onExecuteCommand={handleExecuteCommand}
        onSwitchTab={setActiveTab}
      />
    </div>
  );
};

export default App;
