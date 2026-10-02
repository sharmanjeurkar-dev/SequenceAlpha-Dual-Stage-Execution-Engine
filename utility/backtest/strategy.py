"""
Cross-Sectional Top-N Rebalancing Strategy for Backtrader using TFT Alpha Scores.
"""

import math
import backtrader as bt


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
                        "exit_reason": "Rebalance Exit",
                    })

                    pos["shares"] -= matched_shares
                    remaining_sell -= matched_shares
                    if pos["shares"] <= 0:
                        self._open_positions[sym].pop(0)

            if self.p.verbose:
                print(
                    f"[{dt}] {action} {sym}: Size={size}, Price={price:.2f}, "
                    f"Cost={cost:.2f}, Commission={comm:.2f}"
                )
        elif order.status in [order.Canceled, order.Margin, order.Rejected]:
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
        ("verbose", False),
    )

    def __init__(self):
        super().__init__()
        self.position_expiry = {}

    def next(self):
        self.bar_count += 1
        dt = self.data.datetime.date(0)
        curr_val = self.broker.getvalue()
        self.daily_values.append(curr_val)
        self.daily_dates.append(dt)

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
            for i, d in enumerate(initial_picks):
                tier = i // self.p.daily_cohort_size
                exp = self.bar_count + min(tier + 1, self.p.holding_bars)
                self.position_expiry[d] = exp
                self.order_target_percent(data=d, target=target_pct)
            return

        # Subsequent days:
        # A. Identify 5-day horizon expirations
        expired = [
            d for d in self.datas
            if self.getposition(d).size > 0 and self.position_expiry.get(d, 0) <= self.bar_count
        ]
        unexpired = [
            d for d in self.datas
            if self.getposition(d).size > 0 and self.position_expiry.get(d, 0) > self.bar_count
        ]

        slots_needed = self.p.total_positions - len(unexpired)
        if slots_needed <= 0:
            return

        unexpired_set = set(unexpired)
        available_candidates = [c[0] for c in candidates if c[0] not in unexpired_set]
        chosen_today = available_candidates[:slots_needed]
        chosen_set = set(chosen_today)

        # 1. Liquidate expired positions that didn't renew into today's top picks
        for d in expired:
            if d not in chosen_set:
                self.close(data=d)
                self.position_expiry.pop(d, None)

        # 2. Buy or renew today's top picks
        for d in chosen_today:
            self.position_expiry[d] = self.bar_count + self.p.holding_bars
            self.order_target_percent(data=d, target=target_pct)





