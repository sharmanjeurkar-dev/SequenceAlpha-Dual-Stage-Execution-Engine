import React, { useState, useEffect, useCallback } from 'react';
import { BloombergHeader } from './components/BloombergHeader';
import { TickerTape } from './components/TickerTape';
import { KpiSummaryStrip } from './components/KpiSummaryStrip';
import { RechartsFinancialChart, type HourlyChartPoint } from './components/RechartsFinancialChart';
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

function mapActionToStrategyTag(
  action: string
): 'COHORT_ENTRY' | 'TARGET_1_EXIT' | 'TRAILING_STOP' | 'EMERGENCY_STOP' | 'TIME_EXPIRY' | 'MANUAL' {
  const upper = (action || '').toUpperCase();
  if (upper.includes('TARGET_1')) return 'TARGET_1_EXIT';
  if (upper.includes('TRAILING')) return 'TRAILING_STOP';
  if (upper.includes('EMERGENCY') || upper.includes('STOP_LOSS')) return 'EMERGENCY_STOP';
  if (upper.includes('EXPIRY') || upper.includes('TIME_STOP') || upper.includes('DAY_5'))
    return 'TIME_EXPIRY';
  if (upper.includes('MANUAL')) return 'MANUAL';
  return 'COHORT_ENTRY';
}

/**
 * Generates a realistic 168-point jagged 1H TradingView-style price, EMA-200, and Volume series
 * anchored to the stock's entry_price, peak_price, and current LTP when backend parquet series is not yet loaded.
 */
function buildJagged1HSeries(slot: TrancheSlot, currentHourLabel: string): HourlyChartPoint[] {
  const sym = slot.symbol || 'NSE:WELCORP-EQ';
  const entry = slot.entry_price || 100;
  const ltp = slot.ltp || entry;
  const peak = Math.max(slot.peak_price || ltp, entry, ltp);
  const vol = Math.max(slot.volatility_20d || 0.028, 0.018);
  const stop = slot.stop_price || Number((entry * 0.955).toFixed(2));
  const target = Number((entry * 1.06).toFixed(2));

  // Deterministic PRNG seeded by symbol characters
  let seed = 2166136261;
  for (let i = 0; i < sym.length; i++) {
    seed ^= sym.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const nextRand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 10000) / 10000 - 0.5; // [-0.5, +0.5]
  };

  const sessionDates = [
    '20 Aug', '21 Aug', '24 Aug', '25 Aug', '26 Aug', '27 Aug', '28 Aug',
    '01 Sep', '02 Sep', '03 Sep', '04 Sep', '07 Sep', '08 Sep', '09 Sep',
    '10 Sep', '11 Sep', '14 Sep', '15 Sep', '16 Sep', '17 Sep', '18 Sep',
    '21 Sep', '22 Sep', '23 Sep', '24 Sep', '25 Sep', '28 Sep', '29 Sep',
  ];
  const sessionHours = ['09:15', '10:15', '11:15', '12:30', '13:45', '15:15'];
  const totalBars = sessionDates.length * sessionHours.length;

  // Generate raw jagged random walk that hits a realistic multi-week peak & trough and lands on entry -> peak -> ltp
  const rawPrices: number[] = [];
  let p = entry * (0.94 + nextRand() * 0.04);
  const peakIdx = Math.floor(totalBars * 0.28);
  const troughIdx = Math.floor(totalBars * 0.65);
  const entryIdx = Math.max(totalBars - Math.max(slot.holding_bar, 1) * 6 - 2, Math.floor(totalBars * 0.8));

  for (let i = 0; i < totalBars; i++) {
    let targetAnchor = entry;
    if (i < peakIdx) {
      targetAnchor = peak * 1.03;
    } else if (i < troughIdx) {
      targetAnchor = entry * 0.93;
    } else if (i < entryIdx) {
      targetAnchor = entry;
    } else {
      const postEntryProgress = (i - entryIdx) / Math.max(1, totalBars - 1 - entryIdx);
      targetAnchor = postEntryProgress < 0.5 ? peak : ltp;
    }

    const pull = (targetAnchor - p) * 0.14;
    const shock = nextRand() * entry * vol * 1.15;
    p = Math.max(entry * 0.7, p + pull + shock);
    if (i === entryIdx) p = entry;
    if (i === totalBars - 1) p = ltp;
    rawPrices.push(Number(p.toFixed(2)));
  }

  // Compute smooth 45-bar EMA + volume
  const pts: HourlyChartPoint[] = [];
  let ema = rawPrices[0];
  const k = 2 / (45 + 1);

  for (let i = 0; i < totalBars; i++) {
    const dIdx = Math.floor(i / sessionHours.length);
    const hIdx = i % sessionHours.length;
    const price = rawPrices[i];
    const prev = i > 0 ? rawPrices[i - 1] : price;
    ema = price * k + ema * (1 - k);
    const moveRatio = Math.abs(price - prev) / Math.max(1, entry * vol * 0.4);
    const barVol = Math.floor(250 + moveRatio * 1800 + Math.abs(nextRand()) * 900);
    const timeLbl =
      i === totalBars - 1
        ? `${sessionDates[dIdx]} ${currentHourLabel}`
        : `${sessionDates[dIdx]} ${sessionHours[hIdx]}`;

    pts.push({
      time: timeLbl,
      price,
      ema: Number(ema.toFixed(2)),
      volume: barVol,
      isUp: price >= prev,
      stop,
      target,
    });
  }

  return pts;
}

export const App: React.FC = () => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'slots' | 'equity' | 'dual' | 'tft' | 'blotter'>(
    'dashboard'
  );
  const [chartMode, setChartMode] = useState<'slot_trail' | 'equity_curve' | 'tft_fan'>('slot_trail');
  const [selectedSlotId, setSelectedSlotId] = useState<number>(0);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);

  // Single-Account 14:50 EOD Continuous Paper Trading State
  const [totalAum, setTotalAum] = useState<number>(990968.09);
  const [cashBuffer, setCashBuffer] = useState<number>(464659.01);
  const [investedValue, setInvestedValue] = useState<number>(526309.08);
  const [quarantineList, setQuarantineList] = useState<Record<string, number>>({
    'NSE:JINDWORLD-EQ': 1,
    'NSE:MTARTECH-BE': 2,
    'NSE:GENESYS-EQ': 3,
    'NSE:PCJEWELLER-EQ': 3,
    'NSE:HIKAL-EQ': 3,
    'NSE:ATALREAL-EQ': 4,
  });

  // Live rolling hourly chart series per symbol (X-axis = hourly buckets; live endpoint updates in-place every 1.5s)
  const [slotPriceHistory, setSlotPriceHistory] = useState<Record<string, HourlyChartPoint[]>>({});
  const [lastTickTime, setLastTickTime] = useState<string>('');

  // Major NSE Benchmark Indices for the top LIVE TICK tape
  const [marketIndices, setMarketIndices] = useState<TickerItem[]>([
    { symbol: 'NIFTY 50', fyers_symbol: 'NSE:NIFTY50-INDEX', price: 22701.15, change_pct: 0.42, up: true, is_index: true },
    { symbol: 'BANK NIFTY', fyers_symbol: 'NSE:NIFTYBANK-INDEX', price: 51482.35, change_pct: 0.58, up: true, is_index: true },
    { symbol: 'INDIA VIX', fyers_symbol: 'NSE:INDIAVIX-INDEX', price: 13.84, change_pct: -3.15, up: false, is_index: true },
    { symbol: 'NIFTY IT', fyers_symbol: 'NSE:NIFTYIT-INDEX', price: 42190.80, change_pct: 1.14, up: true, is_index: true },
    { symbol: 'FINNIFTY', fyers_symbol: 'NSE:FINNIFTY-INDEX', price: 23845.15, change_pct: 0.47, up: true, is_index: true },
    { symbol: 'MIDCAP 100', fyers_symbol: 'NSE:MIDCPNIFTY-INDEX', price: 58912.40, change_pct: 0.89, up: true, is_index: true },
  ]);

  // 15 Tranche Slots (initial fallback synced with enriched portfolio_state.json; immediately overwritten by WS/REST)
  const [slots, setSlots] = useState<TrancheSlot[]>([
    {
      slot_id: 0,
      symbol: 'NSE:WELCORP-EQ',
      entry_date: '2026-09-24',
      entry_price: 2692.2,
      ltp: 2704.6,
      current_shares: 9,
      original_shares: 17,
      peak_price: 2900.0,
      peak_gain: 0.0772,
      target_hit: true,
      stop_price: 2719.12,
      holding_bar: 4,
      expiry_bar: 5,
      volatility_20d: 0.042,
      pnl_pct: 0.46,
    },
    {
      slot_id: 1,
      symbol: 'NSE:OPTIEMUS-EQ',
      entry_date: '2026-09-29',
      entry_price: 796.2,
      ltp: 861.9,
      current_shares: 71,
      original_shares: 71,
      peak_price: 924.9,
      peak_gain: 0.1616,
      target_hit: false,
      stop_price: 760.37,
      holding_bar: 1,
      expiry_bar: 5,
      volatility_20d: 0.0651,
      pnl_pct: 8.25,
    },
    {
      slot_id: 2,
      symbol: 'NSE:WHEELS-EQ',
      entry_date: '2026-09-29',
      entry_price: 2204.0,
      ltp: 2283.9,
      current_shares: 27,
      original_shares: 27,
      peak_price: 2341.0,
      peak_gain: 0.0622,
      target_hit: false,
      stop_price: 2104.82,
      holding_bar: 1,
      expiry_bar: 5,
      volatility_20d: 0.0614,
      pnl_pct: 3.63,
    },
    {
      slot_id: 3,
      symbol: 'NSE:GVPIL-EQ',
      entry_date: '2026-10-12',
      entry_price: 734.85,
      ltp: 698.15,
      current_shares: 95,
      original_shares: 95,
      peak_price: 734.85,
      peak_gain: 0.0,
      target_hit: false,
      stop_price: 666.73,
      holding_bar: 0,
      expiry_bar: 5,
      volatility_20d: 0.0279,
      pnl_pct: -4.99,
    },
    {
      slot_id: 4,
      symbol: 'NSE:PFOCUS-EQ',
      entry_date: '2026-09-28',
      entry_price: 315.2,
      ltp: 284.0,
      current_shares: 252,
      original_shares: 252,
      peak_price: 328.0,
      peak_gain: 0.0406,
      target_hit: false,
      stop_price: 301.02,
      holding_bar: 2,
      expiry_bar: 5,
      volatility_20d: 0.0293,
      pnl_pct: -9.9,
    },
    {
      slot_id: 5,
      symbol: 'NSE:SPARC-EQ',
      entry_date: '2026-09-24',
      entry_price: 203.98,
      ltp: 196.79,
      current_shares: 355,
      original_shares: 355,
      peak_price: 212.0,
      peak_gain: 0.0393,
      target_hit: false,
      stop_price: 194.8,
      holding_bar: 4,
      expiry_bar: 5,
      volatility_20d: 0.0267,
      pnl_pct: -3.52,
    },
    {
      slot_id: 6,
      symbol: 'NSE:NETWEB-EQ',
      entry_date: '2026-09-24',
      entry_price: 4661.5,
      ltp: 4685.4,
      current_shares: 16,
      original_shares: 16,
      peak_price: 4847.9,
      peak_gain: 0.04,
      target_hit: false,
      stop_price: 4451.73,
      holding_bar: 4,
      expiry_bar: 5,
      volatility_20d: 0.025,
      pnl_pct: 0.51,
    },
    {
      slot_id: 7,
      symbol: 'NSE:CUPID-EQ',
      entry_date: '2026-09-28',
      entry_price: 264.5,
      ltp: 343.95,
      current_shares: 166,
      original_shares: 332,
      peak_price: 345.0,
      peak_gain: 0.3043,
      target_hit: true,
      stop_price: 267.15,
      holding_bar: 2,
      expiry_bar: 5,
      volatility_20d: 0.0265,
      pnl_pct: 30.04,
    },
    {
      slot_id: 8,
      symbol: 'NSE:INDOTHAI-EQ',
      entry_date: '2026-09-29',
      entry_price: 31.93,
      ltp: 40.71,
      current_shares: 2501,
      original_shares: 2501,
      peak_price: 40.71,
      peak_gain: 0.275,
      target_hit: false,
      stop_price: 30.49,
      holding_bar: 1,
      expiry_bar: 5,
      volatility_20d: 0.0462,
      pnl_pct: 27.5,
    },
    {
      slot_id: 9,
      symbol: 'NSE:POCL-EQ',
      entry_date: '2026-10-12',
      entry_price: 447.25,
      ltp: 448.4,
      current_shares: 172,
      original_shares: 172,
      peak_price: 450.95,
      peak_gain: 0.0083,
      target_hit: false,
      stop_price: 428.22,
      holding_bar: 0,
      expiry_bar: 5,
      volatility_20d: 0.025,
      pnl_pct: 0.26,
    },
    {
      slot_id: 10,
      symbol: 'NSE:IBULLSLTD-EQ',
      entry_date: '2026-10-12',
      entry_price: 30.95,
      ltp: 32.49,
      current_shares: 1760,
      original_shares: 1760,
      peak_price: 32.49,
      peak_gain: 0.0498,
      target_hit: false,
      stop_price: 31.04,
      holding_bar: 0,
      expiry_bar: 5,
      volatility_20d: 0.025,
      pnl_pct: 4.98,
    },
    ...Array.from({ length: 4 }, (_, i) => ({
      slot_id: i + 11,
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
  const [orders, setOrders] = useState<FyersOrder[]>([]);

  // Single-Account Daily Summary
  const [dailySummary, setDailySummary] = useState<DailySummaryMetric[]>([]);

  // Closed Trades Ledger
  const [closedTrades, setClosedTrades] = useState<PaperTradeRecord[]>([]);

  // Helper to apply incoming state from either WebSocket (INIT_STATE / TICK_UPDATE) or REST
  const applyBackendPayload = useCallback((msg: any) => {
    if (!msg) return;

    const pState = msg.portfolio || msg.payload?.portfolio_state || msg;
    const rawSlots = Array.isArray(pState?.slots) ? pState.slots : Array.isArray(msg.slots) ? msg.slots : null;
    const rawSymbolCharts = msg.symbol_charts || msg.payload?.symbol_charts || null;
    const rawIndices = msg.market_indices || msg.payload?.market_indices || null;

    if (Array.isArray(rawIndices) && rawIndices.length > 0) {
      setMarketIndices(
        rawIndices.map((idxItem: any) => ({
          symbol: String(idxItem.symbol || 'NIFTY 50'),
          fyers_symbol: idxItem.fyers_symbol,
          price: Number(idxItem.price || 0),
          change_pct: Number(idxItem.change_pct || 0),
          up: Boolean(idxItem.up ?? Number(idxItem.change_pct || 0) >= 0),
          is_index: true,
        }))
      );
    }

    if (typeof pState?.cash_balance === 'number') {
      setCashBuffer(pState.cash_balance);
    } else if (typeof msg.cash_balance === 'number') {
      setCashBuffer(msg.cash_balance);
    }

    if (pState?.quarantine && typeof pState.quarantine === 'object') {
      setQuarantineList(pState.quarantine);
    } else if (msg.quarantine && typeof msg.quarantine === 'object') {
      setQuarantineList(msg.quarantine);
    }

    if (rawSlots) {
      const now = new Date();
      const istTimeFull = now.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
      });
      setLastTickTime(istTimeFull);

      const istHourStr =
        now
          .toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour12: false,
            hour: '2-digit',
          })
          .replace(/\D/g, '')
          .padStart(2, '0') + ':00';
      const mappedSlots: TrancheSlot[] = rawSlots.map((s: any) => {
        const sym = s.symbol
          ? String(s.symbol).startsWith('NSE:')
            ? String(s.symbol)
            : `NSE:${s.symbol}-EQ`
          : null;
        const entryPx = Number(s.entry_price || 0);
        const ltpPx = Number(s.ltp ?? s.peak_price ?? s.entry_price ?? 0);
        const computedPnlPct =
          entryPx > 0 ? Number((((ltpPx - entryPx) / entryPx) * 100).toFixed(2)) : 0;
        const pnlPct =
          Math.abs(computedPnlPct) >= 0.01
            ? computedPnlPct
            : typeof s.pnl_pct === 'number' && Math.abs(s.pnl_pct) >= 0.01
            ? Number(s.pnl_pct)
            : Number(s.day_change_pct || 0);
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
          expiry_bar: Number(s.expiry_bar || 5),
          volatility_20d: Number(s.volatility_20d || 0.025),
          pnl_pct: pnlPct,
        };
      });

      setSlots(mappedSlots);

      const liveInvested = mappedSlots.reduce(
        (acc, s) => acc + (s.symbol ? s.current_shares * s.ltp : 0),
        0
      );
      setInvestedValue(Number(liveInvested.toFixed(2)));

      const liveCash =
        typeof pState?.cash_balance === 'number'
          ? pState.cash_balance
          : typeof msg.cash_balance === 'number'
          ? msg.cash_balance
          : null;
      if (liveCash !== null) {
        setTotalAum(Number((liveCash + liveInvested).toFixed(2)));
      } else if (typeof pState?.portfolio_value === 'number') {
        setTotalAum(pState.portfolio_value);
      }

      setSlotPriceHistory((prev) => {
        const next = { ...prev };
        // Always sync the 1H candle series from backend (Fyers 60m candles + parquet fallback)
        if (rawSymbolCharts && typeof rawSymbolCharts === 'object') {
          for (const [symKey, series] of Object.entries(rawSymbolCharts)) {
            if (Array.isArray(series) && series.length > 0) {
              next[symKey] = (series as HourlyChartPoint[]).slice(-60);
            }
          }
        }

        for (const s of mappedSlots) {
          if (!s.symbol || s.entry_price <= 0) continue;
          const targetPx = Number((s.entry_price * 1.06).toFixed(2));
          const existing = next[s.symbol] || [];

          if (existing.length === 0) {
            next[s.symbol] = buildJagged1HSeries(s, istHourStr);
          } else {
            // Update ONLY the current 1-hour bar in-place with the live LTP tick
            // so the timeline stays strictly 1-hour bars while the live tick is synced in real time
            const lastPt = existing[existing.length - 1];
            const prevPt = existing[existing.length - 2] || lastPt;
            const k = 2 / (45 + 1);
            const updatedEma = Number(
              (s.ltp * k + (lastPt.ema || s.entry_price) * (1 - k)).toFixed(2)
            );
            const updatedLastBar: HourlyChartPoint = {
              ...lastPt,
              price: s.ltp,
              ema: updatedEma,
              isUp: s.ltp >= prevPt.price,
              stop: s.stop_price,
              target: targetPx,
            };
            next[s.symbol] = [...existing.slice(0, -1), updatedLastBar];
          }
        }
        return next;
      });
    }

    const rawSummary = msg.daily_summary || msg.payload?.daily_summary;
    if (Array.isArray(rawSummary) && rawSummary.length > 0) {
      const mappedSummary: DailySummaryMetric[] = rawSummary.map((r: any, i: number, arr: any[]) => {
        const pv = Number(r.portfolio_value || 0);
        const prevPv = i > 0 ? Number(arr[i - 1].portfolio_value || 1000000) : 1000000;
        return {
          date: String(r.date || ''),
          portfolio_value: pv,
          cash_balance: Number(r.cash_balance ?? r.cash ?? 0),
          invested_value: Number(r.invested_value || 0),
          pnl_day: Number(r.pnl_day ?? pv - prevPv),
          cum_return_pct: Number(r.cum_return_pct || 0),
          active_slots: Number(r.active_slots || 0),
          win_rate_pct: Number(r.win_rate_pct || 0),
          total_trades: Number(r.total_trades ?? r.closed_trades ?? 0),
        };
      });
      setDailySummary(mappedSummary);
    }

    const rawTrades = msg.trades || msg.closed_trades || msg.payload?.closed_trades;
    if (Array.isArray(rawTrades) && rawTrades.length > 0) {
      setClosedTrades(
        rawTrades.map((t: any, idx: number) => {
          const netPnl = Number(t.net_pnl || 0);
          return {
            trade_id: t.trade_id ?? idx + 1,
            entry_date: String(t.entry_date || ''),
            exit_date: String(t.exit_date || ''),
            holding_days: Number(t.holding_days ?? 5),
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

    const rawOrders = msg.orders || msg.recent_orders || msg.payload?.recent_orders;
    if (Array.isArray(rawOrders) && rawOrders.length > 0) {
      setOrders(
        rawOrders.map((o: any, idx: number) => {
          const actStr = String(o.action || 'BUY_NEW_COHORT');
          const isBuy = actStr.toUpperCase().includes('BUY') || o.side === 'BUY';
          const rawTs = String(o.timestamp || '');
          const shortTs = rawTs.includes('T') ? rawTs.replace('T', ' ').slice(0, 16) : rawTs;
          return {
            order_id: String(o.order_id || `ORD-${String(rawOrders.length - idx).padStart(4, '0')}`),
            timestamp: shortTs,
            symbol: String(o.symbol || '').startsWith('NSE:')
              ? String(o.symbol)
              : `NSE:${o.symbol}-EQ`,
            side: isBuy ? 'BUY' : 'SELL',
            action: actStr,
            order_type: actStr.includes('TARGET_1') ? 'LMT' : 'MKT',
            quantity: Number(o.shares ?? o.quantity ?? 0),
            fill_price: Number(o.price ?? o.fill_price ?? 0),
            turnover: Number(o.turnover || 0),
            commission: Number(o.commission || 0),
            slippage_bps: 5.0,
            strategy_tag: mapActionToStrategyTag(actStr),
            reason: String(o.reason || ''),
            status: 'FILLED',
          };
        })
      );
    }
  }, []);

  // Real-time WebSocket connection to SequenceAlpha Python engine (broadcasts every 1.5s)
  const { isConnected: wsConnected, sendCommand } = useWebSocketStream({
    url: 'ws://localhost:8765/ws',
    onStateUpdate: (msg) => {
      if (msg.type === 'INIT_STATE' || msg.type === 'INITIAL_STATE' || msg.type === 'TICK_UPDATE') {
        applyBackendPayload(msg);
      }
    },
  });

  // Initial REST fetch on mount so updated stocks/orders/summary/1H-charts load immediately
  useEffect(() => {
    const fetchInitialRest = async () => {
      try {
        const [stateRes, sumRes, ordRes, trdRes] = await Promise.all([
          fetch('http://localhost:8765/api/state'),
          fetch('http://localhost:8765/api/daily-summary'),
          fetch('http://localhost:8765/api/orders'),
          fetch('http://localhost:8765/api/trades'),
        ]);
        const stateJson = stateRes.ok ? await stateRes.json() : {};
        const sumJson = sumRes.ok ? await sumRes.json() : [];
        const ordJson = ordRes.ok ? await ordRes.json() : [];
        const trdJson = trdRes.ok ? await trdRes.json() : [];
        applyBackendPayload({
          portfolio: stateJson.portfolio,
          symbol_charts: stateJson.symbol_charts,
          market_indices: stateJson.market_indices,
          daily_summary: sumJson,
          orders: ordJson,
          trades: trdJson,
        });
      } catch {
        // Ignore if dashboard_server.py is not yet running
      }
    };
    fetchInitialRest();
  }, [applyBackendPayload]);

  // LIVE TICK displays only NSE Benchmark Indices
  const tickerItems: TickerItem[] = marketIndices;

  // Dynamically derive TFT Conviction Matrix from active slots + Fold 14 top cohort
  const candidates: TftQuantileInference[] = slots
    .filter((s) => s.symbol)
    .slice(0, 6)
    .map((s) => ({
      symbol: s.symbol as string,
      p10_bearish: -0.024,
      p50_median_alpha: 0.036,
      p90_bullish_breakout: 0.084,
      upside_skew: 3.5,
      conviction_score: 0.33,
      directional_loss: 0.041,
      decile_rank: 10,
    }));

  // Active Slot Data
  const occupiedSlots = slots.filter((s) => s.symbol);
  const activeSlot =
    slots.find((s) => s.slot_id === selectedSlotId && s.symbol) ||
    occupiedSlots[0] ||
    slots[0];

  const slotPriceData: HourlyChartPoint[] =
    (activeSlot.symbol && slotPriceHistory[activeSlot.symbol]) ||
    buildJagged1HSeries(activeSlot, '13:15');

  const equityData = [
    ...dailySummary.map((d) => ({
      date: d.date.slice(5),
      portfolio_value: d.portfolio_value,
      invested_value: d.invested_value,
      benchmark: 1000000,
    })),
    ...(dailySummary.length > 0
      ? [
          {
            date: 'LIVE',
            portfolio_value: totalAum,
            invested_value: investedValue,
            benchmark: 1000000,
          },
        ]
      : []),
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
            action: 'TARGET_1_BOOK_50_PERCENT',
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
    const activeSyms = slots.filter((s) => s.symbol).map((s) => s.symbol as string);
    const syms = activeSyms.length > 0 ? activeSyms : ['NSE:WELCORP-EQ', 'NSE:OPTIEMUS-EQ', 'NSE:PFOCUS-EQ'];
    const sym = syms[Math.floor(Math.random() * syms.length)];
    const fillPrice = Number((100 + Math.random() * 400).toFixed(2));
    const qty = 100;
    const turnover = Number((qty * fillPrice).toFixed(2));
    const commission = Number((turnover * 0.0022).toFixed(2));
    const newOrder: FyersOrder = {
      order_id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
      symbol: sym,
      side: Math.random() > 0.5 ? 'BUY' : 'SELL',
      action: 'BUY_NEW_COHORT',
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
  const cumReturnPct = Number((((totalAum - 1000000) / 1000000) * 100).toFixed(2));
  const winCount = closedTrades.filter((t) => t.net_pnl >= 0).length;
  const winRatePct =
    closedTrades.length > 0
      ? Number(((winCount / closedTrades.length) * 100).toFixed(1))
      : latestSummary
      ? latestSummary.win_rate_pct
      : 41.7;
  const totalClosedTrades =
    closedTrades.length > 0
      ? closedTrades.length
      : latestSummary
      ? latestSummary.total_trades
      : 0;

  // Live Unrealised P&L across all open tranche slots
  const unrealisedPnl = Number(
    slots
      .reduce(
        (sum, s) =>
          s.symbol && s.current_shares > 0
            ? sum + (s.ltp - s.entry_price) * s.current_shares
            : sum,
        0
      )
      .toFixed(2)
  );
  const investedCostBasis = slots.reduce(
    (sum, s) =>
      s.symbol && s.current_shares > 0 ? sum + s.entry_price * s.current_shares : sum,
    0
  );
  const unrealisedPnlPct =
    investedCostBasis > 0
      ? Number(((unrealisedPnl / investedCostBasis) * 100).toFixed(2))
      : 0;

  // Realised P&L (Cumulative & Today's Booked)
  const realisedPnl = Number(
    closedTrades.reduce((sum, t) => sum + Number(t.net_pnl || 0), 0).toFixed(2)
  );
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const latestExitDate =
    closedTrades.find((t) => t.exit_date === todayIso)?.exit_date ||
    closedTrades[0]?.exit_date ||
    todayIso;
  const todayRealisedPnl = Number(
    closedTrades
      .filter((t) => t.exit_date === latestExitDate)
      .reduce((sum, t) => sum + Number(t.net_pnl || 0), 0)
      .toFixed(2)
  );

  // Day's Total Intraday P&L (Live AUM vs Previous EOD AUM)
  const prevEodAum = latestSummary ? latestSummary.portfolio_value : 1000000;
  const rawDaysPnl = Number((totalAum - prevEodAum).toFixed(2));
  const daysPnl =
    Math.abs(rawDaysPnl) >= 0.01
      ? rawDaysPnl
      : latestSummary
      ? Number(latestSummary.pnl_day.toFixed(2))
      : 0;
  const daysPnlPct =
    prevEodAum > 0 ? Number(((daysPnl / prevEodAum) * 100).toFixed(2)) : 0;

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
        daysPnl={daysPnl}
        daysPnlPct={daysPnlPct}
        realisedPnl={realisedPnl}
        todayRealisedPnl={todayRealisedPnl}
        unrealisedPnl={unrealisedPnl}
        unrealisedPnlPct={unrealisedPnlPct}
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
                symbol={activeSlot.symbol || 'NSE:WELCORP-EQ'}
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
                shares={activeSlot.current_shares || 1}
                lastTickTime={lastTickTime}
                onRatchetStop={() => handleRatchetStop(activeSlot.slot_id)}
                onHarvestFifty={handleHarvestFifty}
                onEmergencyClose={() => handleEmergencyClose(activeSlot.slot_id)}
              />
            </div>

            {/* Tranches Monitor (5 cols) */}
            <div className="col-span-12 lg:col-span-5">
              <TrancheMatrix
                slots={slots}
                selectedSlotId={activeSlot.slot_id}
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
              selectedSlotId={activeSlot.slot_id}
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
