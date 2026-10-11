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

export interface DualAccountMetrics {
  date: string;
  account_a_value: number;
  account_b_value: number;
  account_a_pnl_day: number;
  account_b_pnl_day: number;
  account_a_cum_return_pct: number;
  account_b_cum_return_pct: number;
  account_a_active_slots: number;
  account_b_active_slots: number;
  account_a_win_rate_pct: number;
  account_b_win_rate_pct: number;
  leader: string;
}

export interface FyersOrder {
  order_id: string;
  timestamp: string;
  account: 'ACCT_A' | 'ACCT_B';
  symbol: string;
  side: 'BUY' | 'SELL';
  order_type: 'MKT' | 'LMT' | 'SL-M';
  quantity: number;
  fill_price: number;
  slippage_bps: number;
  strategy_tag: 'COHORT_ENTRY' | 'TARGET_1_EXIT' | 'TRAILING_STOP' | 'TIME_EXPIRY' | 'MANUAL';
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
}

export interface TftQuantileInference {
  symbol: string;
  p10_bearish: number;
  p50_median_alpha: number;
  p90_bullish_breakout: number;
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
