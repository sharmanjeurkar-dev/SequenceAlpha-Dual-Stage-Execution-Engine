export interface TrancheSlot {
  slot_id: number;
  symbol: string | null;
  entry_date: string | null;
  entry_price: number;
  ltp: number;
  current_shares: number;
  original_shares: number;
  peak_price: number;
  peak_gain: number;
  target_hit: boolean;
  stop_price: number;
  holding_bar: number;
  expiry_bar: number;
  volatility_20d: number;
  pnl_pct: number;
}

export interface DailySummaryMetric {
  date: string;
  portfolio_value: number;
  cash_balance: number;
  invested_value: number;
  pnl_day: number;
  cum_return_pct: number;
  active_slots: number;
  win_rate_pct: number;
  total_trades: number;
}

export interface PaperTradeRecord {
  trade_id: string | number;
  symbol: string;
  entry_date: string;
  exit_date: string;
  holding_days: number;
  shares: number;
  entry_price: number;
  exit_price: number;
  net_pnl: number;
  net_return_pct: number;
  outcome: 'WIN' | 'LOSS';
  exit_reason: string;
}

export interface FyersOrder {
  order_id: string;
  timestamp: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  action: string;
  order_type: 'MKT' | 'LMT' | 'SL-M';
  quantity: number;
  fill_price: number;
  turnover: number;
  commission: number;
  slippage_bps: number;
  strategy_tag: 'COHORT_ENTRY' | 'TARGET_1_EXIT' | 'TRAILING_STOP' | 'EMERGENCY_STOP' | 'TIME_EXPIRY' | 'MANUAL';
  reason?: string;
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
}

export interface TftQuantileInference {
  symbol: string;
  p10_bearish: number;
  p50_median_alpha: number;
  p90_bullish_breakout: number;
  upside_skew: number;
  conviction_score: number;
  directional_loss: number;
  decile_rank: number;
}

export interface TickerItem {
  symbol: string;
  price: number;
  change_pct: number;
  up: boolean;
}
