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
  DailySummaryMetric,
  PaperTradeRecord,
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

  // Single-Account 14:50 EOD Continuous Paper Trading State (synced with portfolio_state.json & paper_trading_daily_summary.csv)
  const [totalAum, setTotalAum] = useState<number>(993941.81);
  const [cashBuffer, setCashBuffer] = useState<number>(363715.01);
  const [investedValue, setInvestedValue] = useState<number>(630226.8);
  const [quarantineList, setQuarantineList] = useState<Record<string, number>>({
    'NSE:MANALIPETC': 1,
    'NSE:GPTINFRA': 5,
  });

  // 15 Tranche Slots (initial state synced with portfolio_state.json as of 2026-10-07 15:35 EOD)
  const [slots, setSlots] = useState<TrancheSlot[]>([
    {
      slot_id: 0,
      symbol: 'NSE:RESPONIND-EQ',
      entry_date: '2026-10-07',
      entry_price: 159.73,
      ltp: 158.95,
      current_shares: 465,
      original_shares: 465,
      peak_price: 159.73,
      peak_gain: 0.0,
      target_hit: false,
      stop_price: 152.54,
      holding_bar: 1,
      expiry_bar: 5,
      volatility_20d: 0.0363,
      pnl_pct: -0.49,
    },
    {
      slot_id: 1,
      symbol: 'NSE:SHREDIGCEM-EQ',
      entry_date: '2026-10-07',
      entry_price: 90.06,
      ltp: 89.62,
      current_shares: 825,
      original_shares: 825,
      peak_price: 90.06,
      peak_gain: 0.0,
      target_hit: false,
      stop_price: 86.01,
      holding_bar: 1,
      expiry_bar: 5,
      volatility_20d: 0.0252,
      pnl_pct: -0.49,
    },
    {
      slot_id: 2,
      symbol: 'NSE:PFOCUS-EQ',
      entry_date: '2026-10-01',
      entry_price: 162.87,
      ltp: 165.45,
      current_shares: 407,
      original_shares: 407,
      peak_price: 165.62,
      peak_gain: 0.0169,
      target_hit: false,
      stop_price: 155.54,
      holding_bar: 3,
      expiry_bar: 5,
      volatility_20d: 0.0439,
      pnl_pct: 1.58,
    },
    {
      slot_id: 3,
      symbol: 'NSE:GLOBALVECT-EQ',
      entry_date: '2026-10-01',
      entry_price: 229.01,
      ltp: 223.09,
      current_shares: 289,
      original_shares: 289,
      peak_price: 229.01,
      peak_gain: 0.0,
      target_hit: false,
      stop_price: 218.71,
      holding_bar: 3,
      expiry_bar: 5,
      volatility_20d: 0.0243,
      pnl_pct: -2.59,
    },
    {
      slot_id: 4,
      symbol: 'NSE:GFLLIMITED-EQ',
      entry_date: '2026-10-01',
      entry_price: 75.56,
      ltp: 75.08,
      current_shares: 877,
      original_shares: 877,
      peak_price: 75.77,
      peak_gain: 0.0028,
      target_hit: false,
      stop_price: 72.16,
      holding_bar: 3,
      expiry_bar: 5,
      volatility_20d: 0.0138,
      pnl_pct: -0.64,
    },
    {
      slot_id: 5,
      symbol: 'NSE:TVSELECT-EQ',
      entry_date: '2026-10-05',
      entry_price: 404.04,
      ltp: 394.68,
      current_shares: 183,
      original_shares: 183,
      peak_price: 406.0,
      peak_gain: 0.0049,
      target_hit: false,
      stop_price: 385.86,
      holding_bar: 2,
      expiry_bar: 5,
      volatility_20d: 0.0472,
      pnl_pct: -2.32,
    },
    {
      slot_id: 6,
      symbol: 'NSE:ALMONDZ-EQ',
      entry_date: '2026-10-05',
      entry_price: 19.65,
      ltp: 20.51,
      current_shares: 3774,
      original_shares: 3774,
      peak_price: 20.51,
      peak_gain: 0.0439,
      target_hit: false,
      stop_price: 18.76,
      holding_bar: 2,
      expiry_bar: 5,
      volatility_20d: 0.0273,
      pnl_pct: 4.38,
    },
    {
      slot_id: 7,
      symbol: 'NSE:IVC-EQ',
      entry_date: '2026-10-06',
      entry_price: 53.78,
      ltp: 54.03,
      current_shares: 1383,
      original_shares: 1383,
      peak_price: 54.03,
      peak_gain: 0.0046,
      target_hit: false,
      stop_price: 51.36,
      holding_bar: 1,
      expiry_bar: 5,
      volatility_20d: 0.0148,
      pnl_pct: 0.46,
    },
    {
      slot_id: 8,
      symbol: 'NSE:GENCON-EQ',
      entry_date: '2026-10-06',
      entry_price: 109.16,
      ltp: 105.0,
      current_shares: 681,
      original_shares: 681,
      peak_price: 109.16,
      peak_gain: 0.0,
      target_hit: false,
      stop_price: 104.25,
      holding_bar: 1,
      expiry_bar: 5,
      volatility_20d: 0.0298,
      pnl_pct: -3.81,
    },
    ...Array.from({ length: 6 }, (_, i) => ({
      slot_id: i + 9,
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

  // Order Blotter (synced with paper_orders_log.csv)
  const [orders, setOrders] = useState<FyersOrder[]>([
    {
      order_id: 'ORD-0023',
      timestamp: '2026-10-07 14:50',
      symbol: 'NSE:SHREDIGCEM-EQ',
      side: 'BUY',
      action: 'COHORT_ENTRY',
      order_type: 'MKT',
      quantity: 825,
      fill_price: 90.06,
      turnover: 74302.18,
      commission: 163.46,
      slippage_bps: 5.0,
      strategy_tag: 'COHORT_ENTRY',
      status: 'FILLED',
    },
    {
      order_id: 'ORD-0022',
      timestamp: '2026-10-07 14:50',
      symbol: 'NSE:RESPONIND-EQ',
      side: 'BUY',
      action: 'COHORT_ENTRY',
      order_type: 'MKT',
      quantity: 465,
      fill_price: 159.73,
      turnover: 74274.22,
      commission: 163.4,
      slippage_bps: 5.0,
      strategy_tag: 'COHORT_ENTRY',
      status: 'FILLED',
    },
    {
      order_id: 'ORD-0021',
      timestamp: '2026-10-07 14:50',
      symbol: 'NSE:SUPERHOUSE-EQ',
      side: 'SELL',
      action: 'TIME_STOP_5D',
      order_type: 'MKT',
      quantity: 451,
      fill_price: 154.01,
      turnover: 69459.84,
      commission: 152.81,
      slippage_bps: 5.0,
      strategy_tag: 'TIME_EXPIRY',
      status: 'FILLED',
    },
    {
      order_id: 'ORD-0020',
      timestamp: '2026-10-07 14:50',
      symbol: 'NSE:VINDHYATEL-EQ',
      side: 'SELL',
      action: 'TIME_STOP_5D',
      order_type: 'MKT',
      quantity: 54,
      fill_price: 1219.99,
      turnover: 65879.43,
      commission: 144.93,
      slippage_bps: 5.0,
      strategy_tag: 'TIME_EXPIRY',
      status: 'FILLED',
    },
    {
      order_id: 'ORD-0019',
      timestamp: '2026-10-07 14:50',
      symbol: 'NSE:INDOTHAI-EQ',
      side: 'SELL',
      action: 'TIME_STOP_5D',
      order_type: 'MKT',
      quantity: 912,
      fill_price: 40.53,
      turnover: 36963.13,
      commission: 81.32,
      slippage_bps: 5.0,
      strategy_tag: 'TIME_EXPIRY',
      status: 'FILLED',
    },
    {
      order_id: 'ORD-0018',
      timestamp: '2026-10-07 10:15',
      symbol: 'NSE:GPTINFRA-EQ',
      side: 'SELL',
      action: 'STOP_LOSS',
      order_type: 'MKT',
      quantity: 625,
      fill_price: 113.5,
      turnover: 70937.41,
      commission: 156.06,
      slippage_bps: 5.0,
      strategy_tag: 'EMERGENCY_STOP',
      status: 'FILLED',
    },
    {
      order_id: 'ORD-0014',
      timestamp: '2026-10-06 10:15',
      symbol: 'NSE:INDOTHAI-EQ',
      side: 'SELL',
      action: 'TARGET_1_PARTIAL',
      order_type: 'LMT',
      quantity: 912,
      fill_price: 40.71,
      turnover: 37124.21,
      commission: 81.67,
      slippage_bps: 0.0,
      strategy_tag: 'TARGET_1_EXIT',
      status: 'FILLED',
    },
  ]);

  // Single-Account Daily Summary (synced with paper_trading_daily_summary.csv)
  const [dailySummary, setDailySummary] = useState<DailySummaryMetric[]>([
    {
      date: '2026-09-29',
      portfolio_value: 999357.87,
      cash_balance: 800419.63,
      invested_value: 198938.24,
      pnl_day: -642.13,
      cum_return_pct: -0.06,
      active_slots: 3,
      win_rate_pct: 0.0,
      total_trades: 0,
    },
    {
      date: '2026-09-30',
      portfolio_value: 998501.43,
      cash_balance: 601207.22,
      invested_value: 397294.21,
      pnl_day: -856.44,
      cum_return_pct: -0.15,
      active_slots: 6,
      win_rate_pct: 0.0,
      total_trades: 0,
    },
    {
      date: '2026-10-01',
      portfolio_value: 999749.26,
      cash_balance: 402759.2,
      invested_value: 596990.06,
      pnl_day: 1247.83,
      cum_return_pct: -0.03,
      active_slots: 9,
      win_rate_pct: 0.0,
      total_trades: 0,
    },
    {
      date: '2026-10-05',
      portfolio_value: 996228.59,
      cash_balance: 446431.4,
      invested_value: 549797.19,
      pnl_day: -3520.67,
      cum_return_pct: -0.38,
      active_slots: 8,
      win_rate_pct: 0.0,
      total_trades: 4,
    },
    {
      date: '2026-10-06',
      portfolio_value: 1002298.89,
      cash_balance: 260740.3,
      invested_value: 741558.59,
      pnl_day: 6070.3,
      cum_return_pct: 0.23,
      active_slots: 11,
      win_rate_pct: 20.0,
      total_trades: 5,
    },
    {
      date: '2026-10-07',
      portfolio_value: 993941.81,
      cash_balance: 363715.01,
      invested_value: 630226.8,
      pnl_day: -8357.08,
      cum_return_pct: -0.61,
      active_slots: 9,
      win_rate_pct: 33.33,
      total_trades: 9,
    },
  ]);

  // Closed Trades Ledger (synced with paper_trades_log.csv)
  const [closedTrades, setClosedTrades] = useState<PaperTradeRecord[]>([
    {
      trade_id: 1,
      entry_date: '2026-09-29',
      exit_date: '2026-10-05',
      holding_days: 4,
      symbol: 'MANALIPETC',
      shares: 1020,
      entry_price: 64.94,
      exit_price: 61.98,
      net_pnl: -3300.39,
      net_return_pct: -4.55,
      outcome: 'LOSS',
      exit_reason: 'STOP_LOSS',
    },
    {
      trade_id: 2,
      entry_date: '2026-09-29',
      exit_date: '2026-10-05',
      holding_days: 4,
      symbol: 'DCW',
      shares: 997,
      entry_price: 66.43,
      exit_price: 65.58,
      net_pnl: -1139.03,
      net_return_pct: -1.28,
      outcome: 'LOSS',
      exit_reason: 'TIME_STOP_5D',
    },
    {
      trade_id: 3,
      entry_date: '2026-09-29',
      exit_date: '2026-10-05',
      holding_days: 4,
      symbol: 'ALOKINDS',
      shares: 3774,
      entry_price: 17.55,
      exit_price: 17.44,
      net_pnl: -713.38,
      net_return_pct: -0.64,
      outcome: 'LOSS',
      exit_reason: 'TIME_STOP_5D',
    },
    {
      trade_id: 4,
      entry_date: '2026-09-30',
      exit_date: '2026-10-06',
      holding_days: 4,
      symbol: 'INDOTHAI',
      shares: 912,
      entry_price: 36.33,
      exit_price: 40.71,
      net_pnl: 3911.09,
      net_return_pct: 12.05,
      outcome: 'WIN',
      exit_reason: 'TARGET_1_PARTIAL',
    },
    {
      trade_id: 5,
      entry_date: '2026-10-06',
      exit_date: '2026-10-07',
      holding_days: 1,
      symbol: 'GPTINFRA',
      shares: 625,
      entry_price: 118.91,
      exit_price: 113.5,
      net_pnl: -3534.33,
      net_return_pct: -4.55,
      outcome: 'LOSS',
      exit_reason: 'STOP_LOSS',
    },
    {
      trade_id: 6,
      entry_date: '2026-09-30',
      exit_date: '2026-10-07',
      holding_days: 5,
      symbol: 'INDOTHAI',
      shares: 912,
      entry_price: 36.33,
      exit_price: 40.53,
      net_pnl: 3748.55,
      net_return_pct: 11.55,
      outcome: 'WIN',
      exit_reason: 'TIME_STOP_5D',
    },
    {
      trade_id: 7,
      entry_date: '2026-09-30',
      exit_date: '2026-10-07',
      holding_days: 5,
      symbol: 'VINDHYATEL',
      shares: 54,
      entry_price: 1226.41,
      exit_price: 1219.99,
      net_pnl: -491.77,
      net_return_pct: -0.52,
      outcome: 'LOSS',
      exit_reason: 'TIME_STOP_5D',
    },
    {
      trade_id: 8,
      entry_date: '2026-09-30',
      exit_date: '2026-10-07',
      holding_days: 5,
      symbol: 'SUPERHOUSE',
      shares: 451,
      entry_price: 146.76,
      exit_price: 154.01,
      net_pnl: 3117.7,
      net_return_pct: 4.94,
      outcome: 'WIN',
      exit_reason: 'TIME_STOP_5D',
    },
  ]);

  // Real-time WebSocket connection to SequenceAlpha Python engine (utility/paper_trade/dashboard_server.py)
  const { isConnected: wsConnected, sendCommand } = useWebSocketStream({
    url: 'ws://localhost:8765/ws',
    onStateUpdate: (msg) => {
      if (msg.type === 'INITIAL_STATE' || msg.type === 'TICK_UPDATE') {
        const payload = msg.payload || {};
        const pState = payload.portfolio_state || payload.account_a;
        if (pState) {
          if (typeof pState.cash === 'number') setCashBuffer(pState.cash);
          if (pState.quarantine) setQuarantineList(pState.quarantine);
          if (Array.isArray(pState.slots)) {
            setSlots(
              pState.slots.map((s: any) => {
                const sym = s.symbol
                  ? s.symbol.startsWith('NSE:')
                    ? s.symbol
                    : `NSE:${s.symbol}-EQ`
                  : null;
                const entryPx = Number(s.entry_price || 0);
                const ltpPx = Number(s.peak_price || s.entry_price || 0);
                const pnlPct =
                  entryPx > 0 ? Number((((ltpPx - entryPx) / entryPx) * 100).toFixed(2)) : 0;
                return {
                  slot_id: Number(s.slot_id),
                  symbol: sym,
                  entry_date: s.entry_date || null,
                  entry_price: entryPx,
                  ltp: ltpPx,
                  current_shares: Number(s.current_shares || 0),
                  original_shares: Number(s.original_shares || 0),
                  peak_price: Number(s.peak_price || 0),
                  peak_gain: Number(s.peak_gain || 0),
                  target_hit: Boolean(s.target_hit),
                  stop_price: Number(s.stop_price || 0),
                  holding_bar: Number(s.holding_bar || 0),
                  expiry_bar: 5,
                  volatility_20d: Number(s.volatility_20d || 0),
                  pnl_pct: pnlPct,
                };
              })
            );
          }
        }
        if (Array.isArray(payload.daily_summary) && payload.daily_summary.length > 0) {
          const mappedSummary: DailySummaryMetric[] = payload.daily_summary.map((r: any, i: number, arr: any[]) => {
            const pv = Number(r.portfolio_value || 0);
            const prevPv = i > 0 ? Number(arr[i - 1].portfolio_value || 1000000) : 1000000;
            return {
              date: String(r.date || ''),
              portfolio_value: pv,
              cash_balance: Number(r.cash ?? r.cash_balance ?? 0),
              invested_value: Number(r.invested_value || 0),
              pnl_day: Number(r.pnl_day ?? pv - prevPv),
              cum_return_pct: Number(r.cum_return_pct || 0),
              active_slots: Number(r.active_slots || 0),
              win_rate_pct: Number(r.win_rate_pct || 0),
              total_trades: Number(r.closed_trades ?? r.total_trades ?? 0),
            };
          });
          setDailySummary(mappedSummary);
          const latest = mappedSummary[mappedSummary.length - 1];
          if (latest) {
            setTotalAum(latest.portfolio_value);
            setInvestedValue(latest.invested_value);
            setCashBuffer(latest.cash_balance);
          }
        }
        if (Array.isArray(payload.closed_trades) && payload.closed_trades.length > 0) {
          setClosedTrades(
            payload.closed_trades.map((t: any, idx: number) => {
              const netPnl = Number(t.net_pnl || 0);
              return {
                trade_id: t.trade_id ?? idx + 1,
                entry_date: String(t.entry_date || ''),
                exit_date: String(t.exit_date || ''),
                holding_days: Number(t.holding_days || 5),
                symbol: String(t.symbol || ''),
                shares: Number(t.shares || 0),
                entry_price: Number(t.entry_price || 0),
                exit_price: Number(t.exit_price || 0),
                net_pnl: netPnl,
                net_return_pct: Number(t.net_return_pct ?? t.return_pct ?? 0),
                outcome: netPnl >= 0 ? 'WIN' : 'LOSS',
                exit_reason: String(t.exit_reason || ''),
              };
            })
          );
        }
        if (Array.isArray(payload.recent_orders) && payload.recent_orders.length > 0) {
          setOrders(
            payload.recent_orders
              .slice()
              .reverse()
              .map((o: any, idx: number) => ({
                order_id: `ORD-${String(payload.recent_orders.length - idx).padStart(4, '0')}`,
                timestamp: String(o.timestamp || ''),
                symbol: String(o.symbol || '').startsWith('NSE:')
                  ? String(o.symbol)
                  : `NSE:${o.symbol}-EQ`,
                side: (o.side === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
                action: String(o.action || 'COHORT_ENTRY'),
                order_type: 'MKT',
                quantity: Number(o.shares || 0),
                fill_price: Number(o.fill_price || 0),
                turnover: Number(o.turnover || 0),
                commission: Number(o.commission || 0),
                slippage_bps: 5.0,
                strategy_tag: 'COHORT_ENTRY',
                status: 'FILLED',
              }))
          );
        }
      }
    },
  });

  // Ticker stream items (synced with active single-account holdings)
  const [tickerItems] = useState<TickerItem[]>([
    { symbol: 'NIFTY 50', price: 25124.5, change_pct: 0.34, up: true },
    { symbol: 'NSE:ALMONDZ-EQ', price: 20.51, change_pct: 4.38, up: true },
    { symbol: 'NSE:PFOCUS-EQ', price: 165.45, change_pct: 1.58, up: true },
    { symbol: 'NSE:IVC-EQ', price: 54.03, change_pct: 0.46, up: true },
    { symbol: 'NSE:RESPONIND-EQ', price: 158.95, change_pct: -0.49, up: false },
    { symbol: 'NSE:SHREDIGCEM-EQ', price: 89.62, change_pct: -0.49, up: false },
    { symbol: 'NSE:GFLLIMITED-EQ', price: 75.08, change_pct: -0.64, up: false },
    { symbol: 'NSE:TVSELECT-EQ', price: 394.68, change_pct: -2.32, up: false },
    { symbol: 'NSE:GLOBALVECT-EQ', price: 223.09, change_pct: -2.59, up: false },
    { symbol: 'NSE:GENCON-EQ', price: 105.0, change_pct: -3.81, up: false },
  ]);

  // TFT Model Candidates (Fold 14 Champion Skew >= 1.25 & p50 > 0)
  const [candidates] = useState<TftQuantileInference[]>([
    {
      symbol: 'NSE:RESPONIND-EQ',
      p10_bearish: -0.028,
      p50_median_alpha: 0.036,
      p90_bullish_breakout: 0.089,
      upside_skew: 3.18,
      conviction_score: 0.31,
      directional_loss: 0.041,
      decile_rank: 10,
    },
    {
      symbol: 'NSE:SHREDIGCEM-EQ',
      p10_bearish: -0.024,
      p50_median_alpha: 0.031,
      p90_bullish_breakout: 0.076,
      upside_skew: 3.17,
      conviction_score: 0.31,
      directional_loss: 0.044,
      decile_rank: 10,
    },
    {
      symbol: 'NSE:ALMONDZ-EQ',
      p10_bearish: -0.031,
      p50_median_alpha: 0.042,
      p90_bullish_breakout: 0.095,
      upside_skew: 3.06,
      conviction_score: 0.33,
      directional_loss: 0.039,
      decile_rank: 10,
    },
    {
      symbol: 'NSE:PFOCUS-EQ',
      p10_bearish: -0.029,
      p50_median_alpha: 0.034,
      p90_bullish_breakout: 0.082,
      upside_skew: 2.83,
      conviction_score: 0.31,
      directional_loss: 0.045,
      decile_rank: 10,
    },
  ]);

  // Active Slot Data
  const activeSlot = slots[selectedSlotId] || slots[0];

  const slotPriceData = Array.from({ length: 25 }, (_, i) => {
    const base = activeSlot.entry_price || 100;
    const factor = 1 + (Math.sin(i / 3) * 0.02 + i * ((activeSlot.pnl_pct || 0) / 2400));
    const p = Number((base * factor).toFixed(2));
    return {
      time: `14:${(25 + i).toString().padStart(2, '0')}`,
      price: i === 24 ? activeSlot.ltp || p : p,
      stop: activeSlot.stop_price,
      target: Number((activeSlot.entry_price * 1.06).toFixed(2)),
    };
  });

  const equityData = dailySummary.map((d) => ({
    date: d.date.slice(5),
    portfolio_value: d.portfolio_value,
    invested_value: d.invested_value,
    benchmark: 1000000,
  }));

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
          const newStop = Number((s.entry_price * 1.01).toFixed(2));
          return { ...s, stop_price: Math.max(s.stop_price, newStop) };
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
          const turnover = Number((newShares * s.ltp).toFixed(2));
          const commission = Number((turnover * 0.0022).toFixed(2));
          const newOrder: FyersOrder = {
            order_id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
            timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
            symbol: s.symbol,
            side: 'SELL',
            action: 'TARGET_1_PARTIAL',
            order_type: 'LMT',
            quantity: newShares,
            fill_price: s.ltp,
            turnover,
            commission,
            slippage_bps: 0.0,
            strategy_tag: 'TARGET_1_EXIT',
            status: 'FILLED',
          };
          setOrders((o) => [newOrder, ...o]);
          sendCommand('HARVEST_50', { slot_id: selectedSlotId, shares: newShares });
          return {
            ...s,
            target_hit: true,
            current_shares: s.current_shares - newShares,
            stop_price: Math.max(s.stop_price, Number((s.entry_price * 1.01).toFixed(2))),
          };
        }
        return s;
      })
    );
  };

  const handleEmergencyClose = (slotId: number = selectedSlotId) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.slot_id === slotId && s.symbol) {
          const turnover = Number((s.current_shares * s.ltp).toFixed(2));
          const commission = Number((turnover * 0.0022).toFixed(2));
          const newOrder: FyersOrder = {
            order_id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
            timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
            symbol: s.symbol,
            side: 'SELL',
            action: 'MANUAL_CLOSE',
            order_type: 'MKT',
            quantity: s.current_shares,
            fill_price: s.ltp,
            turnover,
            commission,
            slippage_bps: 5.0,
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
    const syms = ['NSE:RESPONIND-EQ', 'NSE:SHREDIGCEM-EQ', 'NSE:PFOCUS-EQ', 'NSE:ALMONDZ-EQ'];
    const sym = syms[Math.floor(Math.random() * syms.length)];
    const fillPrice = Number((40 + Math.random() * 120).toFixed(2));
    const qty = 200;
    const turnover = Number((qty * fillPrice).toFixed(2));
    const commission = Number((turnover * 0.0022).toFixed(2));
    const newOrder: FyersOrder = {
      order_id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
      symbol: sym,
      side: Math.random() > 0.5 ? 'BUY' : 'SELL',
      action: 'COHORT_ENTRY',
      order_type: 'MKT',
      quantity: qty,
      fill_price: fillPrice,
      turnover,
      commission,
      slippage_bps: 5.0,
      strategy_tag: 'COHORT_ENTRY',
      status: 'FILLED',
    };
    setOrders((prev) => [newOrder, ...prev]);
  };

  const handleExecuteCommand = (cmd: string) => {
    const upper = cmd.trim().toUpperCase();
    if (upper === 'HELP') {
      alert(
        'COMMANDS:\n- BUY [SYM] [QTY]\n- RATCHET [SLOT]\n- CLOSE [SLOT]\n- EQUITY / SLOTS / LEDGER / TFT / BLOTTER\n- HALT'
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
                  stop_price: 143.25,
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
    } else if (upper === 'LEDGER' || upper === 'DUAL') {
      setActiveTab('dual');
    } else if (upper === 'HALT') {
      sendCommand('HALT');
      alert('CIRCUIT BREAKER: Execution halted.');
    }
  };

  const latestSummary = dailySummary[dailySummary.length - 1];
  const cumReturnPct = latestSummary ? latestSummary.cum_return_pct : -0.61;
  const winRatePct = latestSummary ? latestSummary.win_rate_pct : 33.33;
  const totalClosedTrades = latestSummary ? latestSummary.total_trades : closedTrades.length;

  return (
    <div className="flex flex-col min-h-screen bg-[#030508] text-[#e6edf3] font-mono select-none">
      {/* 1. Header */}
      <BloombergHeader
        wsConnected={wsConnected}
        regime="CHAMPION 14:50 EOD"
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
        aumPct={cumReturnPct}
        investedValue={investedValue}
        cashBuffer={cashBuffer}
        activeSlotsCount={slots.filter((s) => s.symbol).length}
        winRatePct={winRatePct}
        totalTrades={totalClosedTrades}
        quarantineCount={Object.keys(quarantineList).length}
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
            &lt;F3&gt; OOS EQUITY CURVE
          </button>
          <button
            onClick={() => setActiveTab('dual')}
            className={`px-2.5 py-1 rounded-sm border font-bold transition-colors ${
              activeTab === 'dual'
                ? 'bg-[#ff9900] text-black border-[#ff9900]'
                : 'bg-[#161d27] text-gray-300 border-[#263140] hover:text-white'
            }`}
          >
            &lt;F4&gt; 14:50 EOD LEDGER &amp; TRADES
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
                symbol={activeSlot.symbol || 'NSE:RESPONIND-EQ'}
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
                holdingBar={activeSlot.holding_bar}
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

            {/* Single-Account EOD Ledger & Closed Trades (5 cols) */}
            <div className="col-span-12 lg:col-span-5">
              <DualAccountComparator
                dailySummary={dailySummary}
                trades={closedTrades}
                quarantine={quarantineList}
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
              dailySummary={dailySummary}
              trades={closedTrades}
              quarantine={quarantineList}
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
