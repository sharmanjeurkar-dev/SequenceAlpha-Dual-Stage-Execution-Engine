"""
Production Portfolio State Manager for AlphaHarvest-Trailing Strategy.
Manages the 15-slot tranche lifecycle, state persistence, intraday stop ratcheting,
and uncapped cash-aware daily cohort rebalancing.
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple


class PortfolioStateManager:
    def __init__(
        self,
        state_file: str = "portfolio_state.json",
        total_positions: int = 15,
        holding_bars: int = 5,
        daily_cohort_size: int = 3,
        cash_buffer: float = 0.05,
        target_profit_threshold: float = 0.06,  # Target 1 = +6.0%
        partial_exit_ratio: float = 0.50,       # Book 50%
        break_even_buffer: float = 0.010,       # +1.0% net floor
        stop_loss_threshold: float = 0.045,     # -4.5% flat stop (Champion: 46.79% CAGR / 1.70 Sharpe)
        use_vol_adaptive_stop: bool = False,    # Optional Clamped Volatility-Adaptive Stop: clip(1.8 * vol_20d, 4.0%, 5.5%)
        vol_stop_min: float = 0.040,            # 4.0% minimum stop floor
        vol_stop_max: float = 0.055,            # 5.5% maximum stop cap
        vol_stop_mult: float = 1.8,             # 1.8x daily volatility multiplier
        rem_trail_min: float = 0.05,            # 5.0% trail cushion
        trailing_vol_mult: float = 1.8,         # 1.8 * sigma
        quarantine_bars: int = 5,
        min_score: float = 0.0,                 # Conviction gate: require positive p50 > 0.0
        min_upside_skew: float = 1.25,          # Upside/Downside skew filter: p90 / |p10| >= 1.25
        bear_cohort_size: int = 1,              # Reduced daily cohort size during Nifty 50 bear regime
        bear_cash_buffer: float = 0.25,         # Elevated cash buffer during Nifty 50 bear regime
    ):
        self.state_file = state_file
        self.total_positions = total_positions
        self.holding_bars = holding_bars
        self.daily_cohort_size = daily_cohort_size
        self.cash_buffer = cash_buffer
        self.target_profit_threshold = target_profit_threshold
        self.partial_exit_ratio = partial_exit_ratio
        self.break_even_buffer = break_even_buffer
        self.stop_loss_threshold = stop_loss_threshold
        self.use_vol_adaptive_stop = use_vol_adaptive_stop
        self.vol_stop_min = vol_stop_min
        self.vol_stop_max = vol_stop_max
        self.vol_stop_mult = vol_stop_mult
        self.rem_trail_min = rem_trail_min
        self.trailing_vol_mult = trailing_vol_mult
        self.quarantine_bars = quarantine_bars
        self.min_score = min_score
        self.min_upside_skew = min_upside_skew
        self.bear_cohort_size = bear_cohort_size
        self.bear_cash_buffer = bear_cash_buffer

        self.state = self.load_state()

    def _default_state(self) -> dict:
        return {
            "last_updated": datetime.now().isoformat(),
            "cash_balance": 1_000_000.0,
            "portfolio_value": 1_000_000.0,
            "slots": [
                {
                    "slot_id": i,
                    "symbol": None,
                    "entry_date": None,
                    "entry_price": None,
                    "current_shares": 0,
                    "original_shares": 0,
                    "peak_price": None,
                    "peak_gain": 0.0,
                    "target_hit": False,
                    "stop_price": None,
                    "holding_bar": 0,
                    "expiry_bar": 0,
                    "volatility_20d": 0.025,
                }
                for i in range(self.total_positions)
            ],
            "quarantine": {},  # symbol -> remaining_bars
        }

    def load_state(self) -> dict:
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, "r") as f:
                    return json.load(f)
            except Exception:
                pass
        return self._default_state()

    def save_state(self):
        self.state["last_updated"] = datetime.now().isoformat()
        temp_file = f"{self.state_file}.tmp"
        with open(temp_file, "w") as f:
            json.dump(self.state, f, indent=2)
        os.replace(temp_file, self.state_file)

    def process_intraday_ticks(self, current_prices: Dict[str, float]) -> List[dict]:
        """
        Processes real-time ticks/prices across all active positions.
        Generates immediate execution signals:
        - Target 1: Book 50% shares + ratchet stop to Break-Even floor (+1.0%)
        - Emergency Cut: Drop 100% shares if loss >= -4.5%
        - Dynamic Trailing: Exit remaining 50% shares if trailing stop breached
        """
        actions = []
        for s in self.state["slots"]:
            sym = s["symbol"]
            if sym is None or sym not in current_prices:
                continue

            price = float(current_prices[sym])
            s["ltp"] = round(price, 2)
            if s["entry_price"] is None:
                continue
            s["pnl_pct"] = round(((price - float(s["entry_price"])) / float(s["entry_price"])) * 100.0, 2)

            # Update peak price and gain
            if s["peak_price"] is None:
                s["peak_price"] = max(price, s["entry_price"])
            elif price > s["peak_price"]:
                s["peak_price"] = price
            peak_gain = (s["peak_price"] / s["entry_price"]) - 1.0
            s["peak_gain"] = max(s["peak_gain"], peak_gain)

            # Stage 1: Before Target 1 is hit
            if not s["target_hit"]:
                # Check Emergency Stop Loss (Clamped Volatility-Adaptive or Flat Fallback)
                if s.get("stop_price") is not None:
                    effective_stop = s["stop_price"]
                else:
                    vol = s.get("volatility_20d", 0.025)
                    stop_dist = (
                        min(self.vol_stop_max, max(self.vol_stop_min, self.vol_stop_mult * vol))
                        if self.use_vol_adaptive_stop
                        else self.stop_loss_threshold
                    )
                    effective_stop = s["entry_price"] * (1.0 - stop_dist)

                if price <= effective_stop:
                    loss_pct = (1.0 - (price / s["entry_price"])) * 100
                    actions.append({
                        "action": "EMERGENCY_CUT_100_PERCENT",
                        "slot_id": s["slot_id"],
                        "symbol": sym,
                        "shares": s["current_shares"],
                        "price": price,
                        "entry_price": s["entry_price"],
                        "entry_date": s.get("entry_date"),
                        "reason": f"Emergency vol-stop cut at -{loss_pct:.2f}% (stop={effective_stop:.2f})",
                    })
                    self.state["cash_balance"] = self.state.get("cash_balance", 0.0) + (s["current_shares"] * price)
                    self.state["quarantine"][sym] = self.quarantine_bars
                    self._clear_slot(s)
                    continue

                # Check Target 1 (+6.0% Peak Gain)
                if peak_gain >= self.target_profit_threshold:
                    shares_to_book = int(s["original_shares"] * self.partial_exit_ratio)
                    if shares_to_book > 0:
                        actions.append({
                            "action": "TARGET_1_BOOK_50_PERCENT",
                            "slot_id": s["slot_id"],
                            "symbol": sym,
                            "shares": shares_to_book,
                            "price": price,
                            "entry_price": s["entry_price"],
                            "entry_date": s.get("entry_date"),
                            "reason": f"Target 1 booked 50% at peak +{peak_gain*100:.2f}%",
                        })
                        self.state["cash_balance"] = self.state.get("cash_balance", 0.0) + (shares_to_book * price)
                        s["current_shares"] -= shares_to_book
                    s["target_hit"] = True
                    be_floor = s["entry_price"] * (1.0 + self.break_even_buffer)
                    s["stop_price"] = max(s["stop_price"] or 0.0, be_floor)

            # Stage 2: After Target 1 is hit (Dynamic Trailing Stop)
            else:
                be_floor = s["entry_price"] * (1.0 + self.break_even_buffer)
                trail_cushion = max(self.rem_trail_min, self.trailing_vol_mult * s["volatility_20d"])
                dynamic_stop = s["peak_price"] * (1.0 - trail_cushion)
                s["stop_price"] = max(s["stop_price"] or 0.0, dynamic_stop, be_floor)

                if price <= s["stop_price"]:
                    actions.append({
                        "action": "TRAILING_STOP_EXIT_REMAINING",
                        "slot_id": s["slot_id"],
                        "symbol": sym,
                        "shares": s["current_shares"],
                        "price": price,
                        "entry_price": s["entry_price"],
                        "entry_date": s.get("entry_date"),
                        "reason": f"Dynamic trailing stop hit at {price:.2f} (stop={s['stop_price']:.2f})",
                    })
                    self.state["cash_balance"] = self.state.get("cash_balance", 0.0) + (s["current_shares"] * price)
                    self._clear_slot(s)

        # Update live mark-to-market portfolio_value on every tick pass
        invested_val = sum(
            s["current_shares"] * float(s.get("ltp") or s.get("entry_price") or 0.0)
            for s in self.state["slots"]
            if s.get("symbol") is not None
        )
        self.state["portfolio_value"] = round(self.state.get("cash_balance", 0.0) + invested_val, 2)
        self.save_state()
        return actions

    def plan_eod_rebalance(
        self,
        candidates: List[Tuple[str, float]],
        liquid_cash: Optional[float] = None,
        current_prices: Dict[str, float] = None,
        volatilities: Dict[str, float] = None,
        upside_skews: Dict[str, float] = None,
        is_bear_regime: bool = False,
    ) -> Tuple[List[dict], List[dict]]:
        """
        Executes Day-5 cohort rollover, liquidates expiring/losing slots,
        and deploys available capital into top candidates without arbitrary caps.
        Returns: (exit_orders, buy_orders)
        """
        if liquid_cash is None:
            liquid_cash = self.state.get("cash_balance", 1_000_000.0)
        if current_prices is None:
            current_prices = {}
        if volatilities is None:
            volatilities = {}

        exit_orders = []
        buy_orders = []

        # 1. Update holding bars and identify expiring slots
        expiring_slots = []
        for s in self.state["slots"]:
            if s["symbol"] is not None:
                s["holding_bar"] += 1
                if s["holding_bar"] >= self.holding_bars:
                    expiring_slots.append(s)
            else:
                expiring_slots.append(s)

        # 2. Liquidate expiring positions
        expected_sales_proceeds = 0.0
        for s in expiring_slots:
            sym = s["symbol"]
            if sym is not None and s["current_shares"] > 0:
                price = current_prices.get(sym, s["entry_price"] or 100.0)
                exit_orders.append({
                    "action": "DAY_5_EXPIRY_EXIT",
                    "slot_id": s["slot_id"],
                    "symbol": sym,
                    "shares": s["current_shares"],
                    "price": price,
                    "entry_price": s["entry_price"],
                    "entry_date": s.get("entry_date"),
                    "reason": "Day-5 tranche expiry",
                })
                proceeds = s["current_shares"] * price
                expected_sales_proceeds += proceeds
                self.state["cash_balance"] = self.state.get("cash_balance", 0.0) + proceeds
                ret = (price / s["entry_price"]) - 1.0 if s["entry_price"] else 0.0
                if ret < 0:
                    self.state["quarantine"][sym] = self.quarantine_bars
            self._clear_slot(s)

        # 3. Decrement quarantine counters
        quarantine_to_delete = []
        for sym, bars in self.state["quarantine"].items():
            if bars <= 1:
                quarantine_to_delete.append(sym)
            else:
                self.state["quarantine"][sym] -= 1
        for sym in quarantine_to_delete:
            del self.state["quarantine"][sym]

        # 4. Filter top candidate picks (with conviction gate, upside skew filter, and macro regime throttle)
        active_symbols = {s["symbol"] for s in self.state["slots"] if s["symbol"] is not None}
        quarantined_symbols = set(self.state["quarantine"].keys())

        target_cohort_size = self.bear_cohort_size if is_bear_regime else self.daily_cohort_size
        slots_to_fill = expiring_slots[:target_cohort_size]
        num_needed = len(slots_to_fill)
        chosen_picks = []
        for item in candidates:
            if len(chosen_picks) >= num_needed:
                break
            sym, score = item[0], item[1]
            if score <= self.min_score:
                continue
            if len(item) >= 3:
                if item[2] < self.min_upside_skew:
                    continue
            elif upside_skews is not None and sym in upside_skews:
                if upside_skews[sym] < self.min_upside_skew:
                    continue
            if sym not in active_symbols and sym not in quarantined_symbols and sym not in chosen_picks:
                chosen_picks.append(sym)

        if not chosen_picks:
            self.save_state()
            return exit_orders, buy_orders

        # 5. Calculate spendable liquid cash
        total_portfolio_value = liquid_cash + expected_sales_proceeds
        for s in self.state["slots"]:
            if s["symbol"] is not None:
                px = current_prices.get(s["symbol"], s["entry_price"] or 100.0)
                total_portfolio_value += s["current_shares"] * px

        effective_cash_buffer = max(self.cash_buffer, self.bear_cash_buffer) if is_bear_regime else self.cash_buffer
        cash_reserve = total_portfolio_value * effective_cash_buffer
        total_available = liquid_cash + expected_sales_proceeds
        net_investable_cash = max(0.0, total_available - cash_reserve) * 0.995

        # Phased vs Steady-state budget:
        currently_held = len(active_symbols)
        if currently_held < (self.total_positions - self.daily_cohort_size):
            cohort_budget = min(net_investable_cash, (total_portfolio_value / self.holding_bars) * 0.995)
        else:
            cohort_budget = net_investable_cash

        # 6. Inverse-volatility weighting across chosen picks
        inv_vols = [1.0 / max(volatilities.get(sym, 0.025), 0.005) for sym in chosen_picks]
        tot_inv = sum(inv_vols)
        weights = [iv / tot_inv for iv in inv_vols]

        for i, s in enumerate(slots_to_fill):
            if i < len(chosen_picks):
                sym = chosen_picks[i]
                price = current_prices.get(sym, 100.0)
                vol = volatilities.get(sym, 0.025)
                stock_cash = cohort_budget * weights[i]
                shares = int(stock_cash / (price * 1.003))

                if shares > 0:
                    stop_dist = (
                        min(self.vol_stop_max, max(self.vol_stop_min, self.vol_stop_mult * vol))
                        if self.use_vol_adaptive_stop
                        else self.stop_loss_threshold
                    )
                    stop_px = round(price * (1.0 - stop_dist), 2)
                    buy_orders.append({
                        "action": "BUY_NEW_COHORT",
                        "slot_id": s["slot_id"],
                        "symbol": sym,
                        "shares": shares,
                        "price": price,
                        "stop_price": stop_px,
                        "cash_allocated": round(stock_cash, 2),
                    })
                    s["symbol"] = sym
                    s["entry_date"] = datetime.now().date().isoformat()
                    s["entry_price"] = price
                    s["ltp"] = price
                    s["current_shares"] = shares
                    s["original_shares"] = shares
                    s["peak_price"] = price
                    s["peak_gain"] = 0.0
                    s["target_hit"] = False
                    s["volatility_20d"] = vol
                    s["stop_price"] = stop_px
                    s["holding_bar"] = 0
                    s["expiry_bar"] = self.holding_bars
        total_spent = sum(b["shares"] * b["price"] * 1.003 for b in buy_orders)
        self.state["cash_balance"] = max(0.0, total_available - total_spent)

        self.save_state()
        return exit_orders, buy_orders

    def _clear_slot(self, slot: dict):
        slot["symbol"] = None
        slot["entry_date"] = None
        slot["entry_price"] = None
        slot["ltp"] = None
        slot["current_shares"] = 0
        slot["original_shares"] = 0
        slot["peak_price"] = None
        slot["peak_gain"] = 0.0
        slot["target_hit"] = False
        slot["stop_price"] = None
        slot["holding_bar"] = 0
        slot["expiry_bar"] = 0
        slot["volatility_20d"] = 0.025
        slot["pnl_pct"] = 0.0
        slot["day_change_pct"] = 0.0
