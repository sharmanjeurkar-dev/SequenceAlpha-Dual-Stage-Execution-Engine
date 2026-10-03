"""
Cross-Sectional Top-N Rebalancing Strategy for Backtrader using TFT Alpha Scores.
"""

import math
import numpy as np
import backtrader as bt
import pandas as pd

try:
    from utility.position_sizing import calculate_position_sizes
except ImportError:
    try:
        from position_sizing import calculate_position_sizes
    except ImportError:
        calculate_position_sizes = None


def compute_feed_volatility(d, default_vol=0.025):
    """
    Computes recent 20-day historical daily return volatility for a data feed.
    """
    try:
        hist_len = min(len(d.close), 21)
        if hist_len >= 5:
            closes = np.array(d.close.get(size=hist_len))
            rets = np.diff(closes) / closes[:-1]
            vol = float(np.std(rets))
            if not np.isnan(vol) and vol > 0.001:
                return vol
    except Exception:
        pass
    return default_vol


class TFTTopNStrategy(bt.Strategy):
    """
    Ranks the universe cross-sectionally by TFT predicted score every `rebalance_days`
    bars and rebalances into the Top N highest-conviction stocks with equal weights.
    """

    params = (
        ("rebalance_days", 5),  # Holding period (matches H=5)
        ("top_n", 15),  # Number of positions to hold
        ("cash_buffer", 0.05),  # 5% cash reserve for slippage/fees
        ("min_score", -999.0),  # Minimum predicted score threshold (default: purely relative rank)
        ("verbose", False),
    )

    def __init__(self):
        self.bar_count = 0
        self.rebalance_count = 0
        self.daily_values = []
        self.daily_dates = []
        self.closed_trades = []
        self.all_orders = []
        self._open_positions = {}  # symbol -> list of open lot dicts
        self._pending_exit_reason = {}  # data -> str exit reason
        self._pending_close = set()  # data feeds with active pending close orders

    def notify_order(self, order):
        if order.status in [order.Completed]:
            dt = self.data.datetime.date(0)
            action = "BUY" if order.isbuy() else "SELL"
            cost = order.executed.value
            comm = order.executed.comm
            price = order.executed.price
            size = order.executed.size
            sym = order.data._name

            # 1. Record every completed order execution
            self.all_orders.append({
                "order_id": len(self.all_orders) + 1,
                "date": dt,
                "symbol": sym,
                "action": action,
                "shares": abs(size),
                "price": round(price, 2),
                "turnover": round(abs(size) * price, 2),
                "commission": round(comm, 2),
            })

            # 2. Institutional FIFO Trade Matching
            if order.isbuy():
                if sym not in self._open_positions:
                    self._open_positions[sym] = []
                self._open_positions[sym].append({
                    "entry_date": dt,
                    "entry_price": price,
                    "shares": size,
                    "entry_comm": comm,
                })
            elif order.issell():
                exit_reason = self._pending_exit_reason.get(order.data, "Rebalance Exit")
                remaining_sell = abs(size)
                while remaining_sell > 0 and sym in self._open_positions and self._open_positions[sym]:
                    pos = self._open_positions[sym][0]
                    matched_shares = min(remaining_sell, pos["shares"])
                    entry_cost = matched_shares * pos["entry_price"]
                    exit_val = matched_shares * price
                    pro_rata_entry_comm = pos["entry_comm"] * (matched_shares / pos["shares"])
                    pro_rata_exit_comm = comm * (matched_shares / abs(size))
                    total_comm = pro_rata_entry_comm + pro_rata_exit_comm

                    gross_pnl = exit_val - entry_cost
                    net_pnl = gross_pnl - total_comm
                    ret_pct = (net_pnl / entry_cost) * 100 if entry_cost > 0 else 0.0
                    holding_days = (dt - pos["entry_date"]).days

                    self.closed_trades.append({
                        "trade_id": len(self.closed_trades) + 1,
                        "symbol": sym,
                        "entry_date": pos["entry_date"],
                        "exit_date": dt,
                        "holding_days": holding_days,
                        "shares": matched_shares,
                        "entry_price": round(pos["entry_price"], 2),
                        "exit_price": round(price, 2),
                        "cost_basis": round(entry_cost, 2),
                        "exit_value": round(exit_val, 2),
                        "gross_pnl": round(gross_pnl, 2),
                        "total_commission": round(total_comm, 2),
                        "net_pnl": round(net_pnl, 2),
                        "net_return_pct": round(ret_pct, 2),
                        "outcome": "WIN" if net_pnl > 0 else "LOSS",
                        "exit_reason": exit_reason,
                    })

                    pos["shares"] -= matched_shares
                    remaining_sell -= matched_shares
                    if pos["shares"] <= 0:
                        self._open_positions[sym].pop(0)

                self._pending_exit_reason.pop(order.data, None)

            self._pending_close.discard(order.data)

            if self.p.verbose:
                print(
                    f"[{dt}] {action} {sym}: Size={size}, Price={price:.2f}, "
                    f"Cost={cost:.2f}, Commission={comm:.2f}"
                )
        elif order.status in [order.Canceled, order.Margin, order.Rejected]:
            self._pending_exit_reason.pop(order.data, None)
            self._pending_close.discard(order.data)
            if order.isbuy() and hasattr(self, "slots"):
                for s in self.slots:
                    if s["stock"] == order.data:
                        s["stock"] = None
                        s["expiry_bar"] = self.bar_count + 1
            if self.p.verbose:
                print(f"ORDER FAILED for {order.data._name}: Status={order.getstatusname()}")


    def notify_trade(self, trade):
        if trade.isclosed and self.p.verbose:
            dt = self.data.datetime.date(0)
            print(
                f"[{dt}] TRADE CLOSED {trade.data._name}: PnL Gross={trade.pnl:.2f}, "
                f"Net={trade.pnlcomm:.2f} ({(trade.pnlcomm / trade.price) * 100:.2f}%)"
            )

    def next(self):
        self.bar_count += 1
        dt = self.data.datetime.date(0)
        curr_val = self.broker.getvalue()
        self.daily_values.append(curr_val)
        self.daily_dates.append(dt)

        # Only rebalance on specified cadence
        if self.bar_count % self.p.rebalance_days != 0:
            return

        self.rebalance_count += 1

        # 1. Collect candidate scores across all active feeds on this bar
        candidates = []
        for d in self.datas:
            if len(d) > 0:
                score = d.score[0]
                close_px = d.close[0]
                # Check for valid numeric score and valid market price
                if (
                    not math.isnan(score)
                    and score >= self.p.min_score
                    and not math.isnan(close_px)
                    and close_px > 0
                ):
                    candidates.append((d, score))

        if not candidates:
            return

        # 2. Sort by score descending (highest predicted return first)
        candidates.sort(key=lambda x: x[1], reverse=True)
        top_picks = [c[0] for c in candidates[: self.p.top_n]]
        top_pick_names = set(d._name for d in top_picks)

        # 3. Liquidate positions no longer in top N
        for d in self.datas:
            pos = self.getposition(d)
            if pos.size > 0 and d._name not in top_pick_names:
                self.close(data=d)

        # 4. Allocate capital equally across top picks
        target_pct = (1.0 - self.p.cash_buffer) / len(top_picks)
        for d in top_picks:
            self.order_target_percent(data=d, target=target_pct)


class TFTRollingCohortsStrategy(TFTTopNStrategy):
    """
    Overlapping Rolling Tranche Strategy (Strategy C):
    Maintains a steady-state portfolio of `total_positions` stocks (default 15).
    Every single trading day:
    - Positions that reached their holding period (5 bars) expire.
    - Today's freshest signals are queried, and the top candidates (default 3)
      are bought, eliminating day-of-week timing lag and capturing mid-week surges.
    """

    params = (
        ("total_positions", 15),
        ("holding_bars", 5),
        ("daily_cohort_size", 3),
        ("cash_buffer", 0.05),
        ("min_score", -999.0),
        ("use_dynamic_sizing", True),      # Pillar 1: Dynamic inverse-volatility sizing
        ("enable_kill_switch", True),      # Hybrid: Mid-week emergency cut at -4.5%
        ("kill_switch_threshold", 0.045),  # 4.5% loss stop
        ("enable_partial_profit", True),   # 50% profit booking at Target 1
        ("target_profit_threshold", 0.06), # Target 1 = +6.0% peak gain
        ("partial_exit_ratio", 0.50),      # Book 50% shares
        ("enable_break_even_stop", True),  # Ratchet stop to Break-Even upon Target 1
        ("break_even_buffer", 0.010),      # +1.0% net Break-Even price floor
        ("enable_rem_trailing", True),     # Setup C: Dynamic Trailing on Rem 50% (26.23% Max DD & +1.1% in 2025)
        ("rem_trail_cushion", 0.05),       # 5.0% cushion if trailing enabled
        ("trailing_vol_mult", 1.8),        # Volatility multiplier
        ("enable_capital_recycling", True), # Efficiently redeploy freed target cash into incoming cohorts (uncapped)
        ("refill_cut_slots_next_day", True),  # Next day add 3 + cut yesterday!
        ("quarantine_bars", 5),            # Quarantine cut stocks from next predictions
        ("never_renew_losers", True),      # Option C: Enforce liquidation at Day 5 for losing cohorts
        ("verbose", False),
    )

    def __init__(self):
        super().__init__()
        # 15 fixed slots across 5 staggered tranches of 3 slots each
        self.slots = [{
            "stock": None,
            "expiry_bar": 0,
            "entry_bar": 0,
            "entry_price": None,
            "peak_price": None,
            "stop_price": None,
            "target_hit": False,
            "volatility": 0.025,
            "peak_gain": 0.0,
        } for _ in range(self.p.total_positions)]
        self.quarantined = {}  # data -> expiry_bar

    def compute_cohort_sizes(self, picks, budget_pct):
        """
        Calculates dynamic position sizes for an entering cohort using utility/position_sizing.py.
        Falls back to equal weighting if historical data is insufficient or disabled.
        """
        if not picks or budget_pct <= 0:
            return {}

        equal_pct = budget_pct / len(picks)
        if not self.p.use_dynamic_sizing or calculate_position_sizes is None:
            return {d: equal_pct for d in picks}

        min_len = min([len(d.close) for d in picks] + [20])
        if min_len < 3:
            return {d: equal_pct for d in picks}

        price_dict = {}
        model_signals = {}
        for d in picks:
            price_dict[d._name] = list(d.close.get(size=min_len))

            p50 = d.score[0] if (hasattr(d, "score") and not math.isnan(d.score[0])) else 0.0
            p10 = d.p10[0] if (hasattr(d, "p10") and not math.isnan(d.p10[0])) else (p50 - 0.02)
            p90 = d.p90[0] if (hasattr(d, "p90") and not math.isnan(d.p90[0])) else (p50 + 0.02)

            model_signals[d._name] = {
                "p10": p10,
                "p50": p50,
                "p90": p90,
            }

        price_df = pd.DataFrame(price_dict)
        sizes_by_name = calculate_position_sizes(
            stock_list=[d._name for d in picks],
            price_history=price_df,
            model_signals=model_signals,
            total_budget=budget_pct,
        )

        return {d: sizes_by_name.get(d._name, equal_pct) for d in picks}

    def next(self):
        self.bar_count += 1
        dt = self.data.datetime.date(0)
        curr_val = self.broker.getvalue()
        self.daily_values.append(curr_val)
        self.daily_dates.append(dt)

        # 0. Mid-Week Checks: Target 1 (50% Profit Booking), Break-Even Floor & Initial Cut
        if self.bar_count > 1:
            for s in self.slots:
                d = s["stock"]
                if d is not None and d not in self._pending_close:
                    pos = self.getposition(d)
                    if pos.size > 0:
                        # Lazy initialize slot pricing once position exists
                        if s["entry_price"] is None:
                            s["entry_price"] = pos.price
                            s["peak_price"] = max(pos.price, d.high[0])
                            s["volatility"] = compute_feed_volatility(d)
                            s["stop_price"] = s["entry_price"] * (1.0 - self.p.kill_switch_threshold)
                            s["target_hit"] = False

                        curr_high = d.high[0]
                        curr_low = d.low[0]
                        curr_close = d.close[0]
                        unrealized_ret = (curr_close / s["entry_price"]) - 1.0

                        if curr_high > s["peak_price"]:
                            s["peak_price"] = curr_high
                        peak_gain = (s["peak_price"] / s["entry_price"]) - 1.0
                        s["peak_gain"] = max(s.get("peak_gain", 0.0), peak_gain)

                        # Stage 1: Before Target 1 is hit
                        if not s["target_hit"]:
                            # A. Initial Stop Loss at -4.5%
                            if self.p.enable_kill_switch and curr_low <= s["stop_price"]:
                                self._pending_exit_reason[d] = "Mid-Week Cut (-4.5%)"
                                order = self.close(data=d)
                                if order is not None:
                                    self._pending_close.add(d)
                                self.quarantined[d] = self.bar_count + self.p.quarantine_bars
                                s["stock"] = None
                                if self.p.refill_cut_slots_next_day:
                                    s["expiry_bar"] = self.bar_count + 1
                                if self.p.verbose:
                                    print(f"[{dt}] MID-WEEK CUT: {d._name} loss={unrealized_ret*100:.2f}%. Slot refilling next bar.")

                            # B. Target 1 Reached (+6.0% Peak Gain) -> Book 50% Profit, Ratchet Stop to Break-Even Floor!
                            elif self.p.enable_partial_profit and peak_gain >= self.p.target_profit_threshold:
                                half_shares = int(pos.size * self.p.partial_exit_ratio)
                                if half_shares > 0:
                                    self._pending_exit_reason[d] = "Target 1 (50% Profit Booked)"
                                    order = self.sell(data=d, size=half_shares)
                                    if order is not None:
                                        self._pending_close.add(d)
                                s["target_hit"] = True
                                # Ratchet Stop to Break-Even Floor (+1.0% net)
                                if self.p.enable_break_even_stop:
                                    be_floor = s["entry_price"] * (1.0 + self.p.break_even_buffer)
                                    s["stop_price"] = max(s["stop_price"], be_floor)
                                if self.p.verbose:
                                    print(
                                        f"[{dt}] TARGET 1 HIT: {d._name} booked 50% at peak=+{peak_gain*100:.2f}%. "
                                        f"Stop moved to {s['stop_price']:.2f} (Break-Even floor)."
                                    )

                        # Stage 2: After Target 1 is hit -> Manage Remaining 50% Position
                        else:
                            be_floor = s["entry_price"] * (1.0 + self.p.break_even_buffer)
                            if self.p.enable_rem_trailing:
                                trail_dist = max(self.p.rem_trail_cushion, self.p.trailing_vol_mult * s["volatility"])
                                dynamic_stop = s["peak_price"] * (1.0 - trail_dist)
                                s["stop_price"] = max(s["stop_price"], dynamic_stop, be_floor)
                            else:
                                # Pure Break-Even Floor: No trailing shakeout on the way up!
                                s["stop_price"] = max(s["stop_price"], be_floor)

                            if curr_low <= s["stop_price"]:
                                exit_reason = "Remaining 50% Stop Hit (BE/Locked Profit)"
                                self._pending_exit_reason[d] = exit_reason
                                order = self.close(data=d)
                                if order is not None:
                                    self._pending_close.add(d)
                                s["stock"] = None
                                if self.p.refill_cut_slots_next_day:
                                    s["expiry_bar"] = self.bar_count + 1
                                if self.p.verbose:
                                    print(
                                        f"[{dt}] {exit_reason}: {d._name} ret={unrealized_ret*100:.2f}%, "
                                        f"stop={s['stop_price']:.2f}. Slot refilling next bar."
                                    )

        # 1. Collect valid candidates for today
        candidates = []
        for d in self.datas:
            if len(d) > 0:
                score = d.score[0]
                close_px = d.close[0]
                if (
                    not math.isnan(score)
                    and score >= self.p.min_score
                    and not math.isnan(close_px)
                    and close_px > 0
                ):
                    candidates.append((d, score))

        if not candidates:
            return

        candidates.sort(key=lambda x: x[1], reverse=True)
        target_pct = (1.0 - self.p.cash_buffer) / self.p.total_positions

        # Day 1: Staggered initialization across holding_bars
        if self.bar_count == 1:
            initial_picks = [c[0] for c in candidates[: self.p.total_positions]]
            investable_cash = self.broker.getcash() * (1.0 - self.p.cash_buffer)
            cash_per_stock = investable_cash / len(initial_picks)
            for i, d in enumerate(initial_picks):
                tier = i // self.p.daily_cohort_size
                exp = self.bar_count + min(tier + 1, self.p.holding_bars)
                self.slots[i] = {
                    "stock": d,
                    "expiry_bar": exp,
                    "entry_bar": self.bar_count,
                    "entry_price": None,
                    "peak_price": None,
                    "stop_price": None,
                    "target_hit": False,
                    "volatility": 0.025,
                    "peak_gain": 0.0,
                }
                shares = int(cash_per_stock / (d.close[0] * 1.002))
                if shares > 0:
                    self.buy(data=d, size=shares)
            return

        # 2. Identify expiring slots today:
        # Includes scheduled 5-day expiries (typically 3) PLUS any slots cut yesterday!
        # EXACTLY: 3 + number of stocks cut day earlier!
        expiring_slots = [s for s in self.slots if s["expiry_bar"] <= self.bar_count]
        if not expiring_slots:
            return

        # 3. Check Day-5 losers (Option C: Never renew losers)
        losing_expiring = set()
        renewable_winning = set()
        for s in expiring_slots:
            d = s["stock"]
            if d is not None:
                pos = self.getposition(d)
                if pos.size > 0:
                    ret = (d.close[0] / pos.price) - 1.0
                    if self.p.never_renew_losers and ret < 0:
                        losing_expiring.add(d)
                        # Quarantine Day-5 losers from next predictions
                        self.quarantined[d] = self.bar_count + self.p.quarantine_bars
                    else:
                        renewable_winning.add(d)

        # 4. Form candidate selection for today's slots
        active_held = {
            s["stock"] for s in self.slots
            if s["stock"] is not None and s["expiry_bar"] > self.bar_count
        }
        # Quarantined stocks: DO NOT INCLUDE IN NEXT LOT OF PREDICTIONS!
        active_quarantine = {
            d for d, exp in self.quarantined.items() if exp > self.bar_count
        }
        excluded_from_picks = (
            active_held
            | losing_expiring
            | active_quarantine
            | self._pending_close
        )

        num_needed = len(expiring_slots)
        chosen_today = []
        for c in candidates:
            if len(chosen_today) >= num_needed:
                break
            d = c[0]
            if d not in excluded_from_picks and d not in chosen_today:
                chosen_today.append(d)

        chosen_set = set(chosen_today)

        # 5. Liquidate expiring positions and tally incoming sales proceeds
        expected_sales_proceeds = 0.0
        for s in expiring_slots:
            old_d = s["stock"]
            if old_d is not None and old_d not in chosen_set:
                pos = self.getposition(old_d)
                if old_d not in self._pending_close and pos.size > 0:
                    exit_reason = (
                        "Day-5 Loser Cut" if old_d in losing_expiring else "Day-5 Expiry"
                    )
                    self._pending_exit_reason[old_d] = exit_reason
                    order = self.close(data=old_d)
                    if order is not None:
                        self._pending_close.add(old_d)
                        expected_sales_proceeds += pos.size * old_d.close[0]
                s["stock"] = None

        if not chosen_today:
            return

        # 6. Assign chosen stocks to expiring slots and deploy available capital dynamically
        current_liquid_cash = self.broker.getcash()
        total_available_cash = current_liquid_cash + expected_sales_proceeds
        cash_reserve = curr_val * self.p.cash_buffer
        net_investable_cash = max(0.0, total_available_cash - cash_reserve) * 0.995

        if not self.p.enable_capital_recycling:
            max_static_budget = (curr_val * (1.0 - self.p.cash_buffer) / 5.0) * (len(chosen_today) / self.p.daily_cohort_size)
            net_investable_cash = min(net_investable_cash, max_static_budget)

        if len(chosen_today) > 0 and net_investable_cash > 1000.0:
            if self.p.use_dynamic_sizing and calculate_position_sizes is not None:
                vols = [compute_feed_volatility(d) for d in chosen_today]
                inv_vols = [1.0 / max(v, 0.005) for v in vols]
                tot_inv = sum(inv_vols)
                weights = [iv / tot_inv for iv in inv_vols]
            else:
                weights = [1.0 / len(chosen_today)] * len(chosen_today)

            for i, s in enumerate(expiring_slots):
                if i < len(chosen_today):
                    d = chosen_today[i]
                    s["stock"] = d
                    s["expiry_bar"] = self.bar_count + self.p.holding_bars
                    s["entry_bar"] = self.bar_count
                    s["entry_price"] = None
                    s["peak_price"] = None
                    s["stop_price"] = None
                    s["target_hit"] = False
                    s["volatility"] = 0.025
                    s["peak_gain"] = 0.0

                    stock_cash = net_investable_cash * weights[i]
                    shares = int(stock_cash / (d.close[0] * 1.003))
                    if shares > 0:
                        self.buy(data=d, size=shares)
                else:
                    s["stock"] = None
                    s["expiry_bar"] = self.bar_count + 1
                    s["entry_price"] = None
                    s["peak_gain"] = 0.0


# Canonical Strategy Aliases
AlphaHarvestStrategy = TFTRollingCohortsStrategy
AlphaHarvestTrailingStrategy = TFTRollingCohortsStrategy


