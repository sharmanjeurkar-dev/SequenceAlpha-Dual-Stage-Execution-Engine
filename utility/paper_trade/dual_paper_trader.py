"""
Single-Account Live Paper Trading Engine for SequenceAlpha (Champion Strategy).
Executes the Afternoon EOD Continuous Entry (14:50 IST) strategy with:
- Upside/Downside Skew Filter: p90 / |p10| >= 1.25
- Positive Conviction Gate: p50 > 0.0
- Flat -4.5% Initial Stop + Target 1 (+6.0% book 50%) + Break-Even Ratchet (+1.0%) + Dynamic Trailing Stop
- Realistic NSE Delivery statutory transaction costs, 5 bps slippage, and automated daily auditing.
"""

import os
import json
import pandas as pd
import numpy as np
from datetime import datetime, date
from typing import Dict, List, Tuple, Optional

from utility.live.state_manager import PortfolioStateManager


class PaperTradingEngine:
    def __init__(
        self,
        state_file: str = "portfolio_state.json",
        initial_capital: float = 1_000_000.0,
        orders_log_file: str = "paper_orders_log.csv",
        trades_log_file: str = "paper_trades_log.csv",
        summary_file: str = "paper_trading_daily_summary.csv",
        slippage_perc: float = 0.0005,  # 5 bps execution slippage
    ):
        self.state_file = state_file
        self.initial_capital = initial_capital
        self.orders_log_file = orders_log_file
        self.trades_log_file = trades_log_file
        self.summary_file = summary_file
        self.slippage_perc = slippage_perc

        # Initialize the Champion Strategy state manager
        self.mgr = PortfolioStateManager(state_file=self.state_file)

        # Ensure order, trade, and daily summary CSV log files exist with headers
        self._init_csv_logs()

    def _init_csv_logs(self):
        if not os.path.exists(self.orders_log_file):
            df = pd.DataFrame(columns=[
                "order_id", "timestamp", "symbol", "action",
                "shares", "price", "turnover", "commission", "slippage", "reason"
            ])
            df.to_csv(self.orders_log_file, index=False)

        if not os.path.exists(self.trades_log_file):
            df = pd.DataFrame(columns=[
                "trade_id", "symbol", "entry_date", "exit_date",
                "holding_days", "shares", "entry_price", "exit_price",
                "cost_basis", "exit_value", "gross_pnl", "total_commission",
                "net_pnl", "net_return_pct", "outcome", "exit_reason"
            ])
            df.to_csv(self.trades_log_file, index=False)

        if not os.path.exists(self.summary_file):
            df = pd.DataFrame(columns=[
                "date", "portfolio_value", "cash_balance", "invested_value",
                "pnl_day", "cum_return_pct", "active_slots",
                "win_rate_pct", "total_trades"
            ])
            df.to_csv(self.summary_file, index=False)

    def calculate_statutory_costs(self, turnover: float, is_buy: bool) -> float:
        """
        Calculates realistic NSE delivery commissions, STT, turnover charges, and GST.
        """
        stt = turnover * 0.001  # 0.1% STT on both buy and sell
        brokerage = min(20.0, turnover * 0.0003)  # 0.03% capped at ₹20
        exch_turnover = turnover * 0.0000345
        sebi_turnover = turnover * 0.000001
        gst = (brokerage + exch_turnover) * 0.18
        stamp = (turnover * 0.00015) if is_buy else 0.0
        return round(stt + brokerage + exch_turnover + sebi_turnover + gst + stamp, 2)

    def log_order(self, action: str, symbol: str, shares: int, price: float, reason: str = "", sim_date: Optional[str] = None):
        """Logs simulated order execution with slippage and realistic fees."""
        slip_mult = (1.0 + self.slippage_perc) if "BUY" in action else (1.0 - self.slippage_perc)
        exec_price = round(price * slip_mult, 2)
        turnover = round(shares * exec_price, 2)
        comm = self.calculate_statutory_costs(turnover, is_buy="BUY" in action)

        ts_str = f"{sim_date}T14:50:00" if sim_date else datetime.now().isoformat()
        order_df = pd.DataFrame([{
            "order_id": int(datetime.now().timestamp() * 1000),
            "timestamp": ts_str,
            "symbol": symbol,
            "action": action,
            "shares": shares,
            "price": exec_price,
            "turnover": turnover,
            "commission": comm,
            "slippage": round(abs(exec_price - price) * shares, 2),
            "reason": reason,
        }])
        order_df.to_csv(self.orders_log_file, mode="a", header=False, index=False)
        return exec_price, comm

    def log_closed_trade(
        self,
        symbol: str,
        entry_date: str,
        entry_price: float,
        exit_price: float,
        shares: int,
        reason: str,
        exit_date: Optional[str] = None,
    ):
        """Logs closed trade metrics to trades CSV."""
        dt_exit = exit_date or date.today().isoformat()
        try:
            h_days = max(0, (date.fromisoformat(dt_exit) - date.fromisoformat(entry_date)).days)
        except Exception:
            h_days = 5

        cost_basis = round(shares * entry_price, 2)
        exit_val = round(shares * exit_price, 2)
        entry_comm = self.calculate_statutory_costs(cost_basis, is_buy=True)
        exit_comm = self.calculate_statutory_costs(exit_val, is_buy=False)
        total_comm = round(entry_comm + exit_comm, 2)

        gross_pnl = round(exit_val - cost_basis, 2)
        net_pnl = round(gross_pnl - total_comm, 2)
        ret_pct = round((net_pnl / cost_basis) * 100, 2) if cost_basis > 0 else 0.0

        trade_df = pd.DataFrame([{
            "trade_id": int(datetime.now().timestamp() * 1000),
            "symbol": symbol,
            "entry_date": entry_date,
            "exit_date": dt_exit,
            "holding_days": h_days,
            "shares": shares,
            "entry_price": round(entry_price, 2),
            "exit_price": exit_price,
            "cost_basis": cost_basis,
            "exit_value": exit_val,
            "gross_pnl": gross_pnl,
            "total_commission": total_comm,
            "net_pnl": net_pnl,
            "net_return_pct": ret_pct,
            "outcome": "WIN" if net_pnl > 0 else "LOSS",
            "exit_reason": reason,
        }])
        trade_df.to_csv(self.trades_log_file, mode="a", header=False, index=False)

    def process_intraday_market_ticks(
        self,
        current_prices: Dict[str, float],
        sim_date: Optional[str] = None,
    ) -> List[dict]:
        """
        Executes real-time tick monitoring for the afternoon entry portfolio:
        - Target 1 (+6.0%): Books 50% shares and ratchets stop to +1.0% Break-Even floor
        - Dynamic Trailing Stop: Sells remaining 50% shares
        - Emergency Cut (-4.5%): Sells 100% shares and adds to quarantine
        """
        actions = self.mgr.process_intraday_ticks(current_prices)
        for act in actions:
            exec_px, comm = self.log_order(
                action=act["action"],
                symbol=act["symbol"],
                shares=act["shares"],
                price=act["price"],
                reason=act["reason"],
                sim_date=sim_date,
            )
            self.log_closed_trade(
                symbol=act["symbol"],
                entry_date=act.get("entry_date", sim_date or date.today().isoformat()),
                entry_price=act.get("entry_price", act["price"]),
                exit_price=exec_px,
                shares=act["shares"],
                reason=act["reason"],
                exit_date=sim_date,
            )
        return actions

    def execute_afternoon_rebalance(
        self,
        candidates: List[Tuple],
        liquid_cash: Optional[float] = None,
        current_prices: Dict[str, float] = None,
        volatilities: Dict[str, float] = None,
        upside_skews: Dict[str, float] = None,
        is_bear_regime: bool = False,
        sim_date: Optional[str] = None,
    ) -> List[dict]:
        """
        Executes the afternoon EOD continuous rebalance at 14:50 IST.
        Enters top candidates passing p50 > 0 and p90/|p10| >= 1.25 during continuous market hours.
        """
        if liquid_cash is None:
            liquid_cash = self.mgr.state.get("cash_balance", self.initial_capital)
        if current_prices is None:
            current_prices = {}
        if volatilities is None:
            volatilities = {}

        exits, buys = self.mgr.plan_eod_rebalance(
            candidates=candidates,
            liquid_cash=liquid_cash,
            current_prices=current_prices,
            volatilities=volatilities,
            upside_skews=upside_skews,
            is_bear_regime=is_bear_regime,
        )

        # Override entry_date on newly opened slots when running historical date simulation
        if sim_date is not None:
            bought_slot_ids = {b["slot_id"] for b in buys}
            for s in self.mgr.state["slots"]:
                if s["slot_id"] in bought_slot_ids:
                    s["entry_date"] = sim_date
            self.mgr.save_state()

        for ex in exits:
            exec_px, comm = self.log_order(
                action=ex["action"],
                symbol=ex["symbol"],
                shares=ex["shares"],
                price=ex["price"],
                reason=ex["reason"],
                sim_date=sim_date,
            )
            self.log_closed_trade(
                symbol=ex["symbol"],
                entry_date=ex.get("entry_date", sim_date or date.today().isoformat()),
                entry_price=ex.get("entry_price", ex["price"]),
                exit_price=exec_px,
                shares=ex["shares"],
                reason=ex["reason"],
                exit_date=sim_date,
            )

        for b in buys:
            self.log_order(
                action=b["action"],
                symbol=b["symbol"],
                shares=b["shares"],
                price=b["price"],
                reason=f"EOD 14:50 Continuous Entry cash=₹{b['cash_allocated']}",
                sim_date=sim_date,
            )
        return buys

    def audit_daily_summary(
        self,
        current_prices: Dict[str, float],
        sim_date: Optional[str] = None,
    ) -> dict:
        """
        Computes EOD portfolio valuation, daily PnL, cumulative return,
        and logs metrics into paper_trading_daily_summary.csv.
        """
        today_str = sim_date or date.today().isoformat()
        prev_val = self.mgr.state.get("portfolio_value", self.initial_capital)

        cash_bal = self.mgr.state.get("cash_balance", 0.0)
        invested_val = 0.0
        active_slots = 0
        for s in self.mgr.state["slots"]:
            if s["symbol"]:
                active_slots += 1
                invested_val += s["current_shares"] * current_prices.get(s["symbol"], s["entry_price"] or 100.0)

        total_val = cash_bal + invested_val

        trades_df = pd.read_csv(self.trades_log_file) if os.path.exists(self.trades_log_file) else pd.DataFrame()
        if not trades_df.empty:
            full_pos = trades_df.groupby(["symbol", "entry_date"], as_index=False)["net_pnl"].sum()
            win_rate = (full_pos["net_pnl"] > 0).mean() * 100
            total_trades = len(full_pos)
        else:
            win_rate = 0.0
            total_trades = 0

        cum_ret = ((total_val / self.initial_capital) - 1.0) * 100
        pnl_day = total_val - prev_val

        summary_row = {
            "date": today_str,
            "portfolio_value": round(total_val, 2),
            "cash_balance": round(cash_bal, 2),
            "invested_value": round(invested_val, 2),
            "pnl_day": round(pnl_day, 2),
            "cum_return_pct": round(cum_ret, 2),
            "active_slots": active_slots,
            "win_rate_pct": round(win_rate, 2),
            "total_trades": total_trades,
        }

        self.mgr.state["portfolio_value"] = round(total_val, 2)
        self.mgr.save_state()

        sum_df = pd.DataFrame([summary_row])
        sum_df.to_csv(self.summary_file, mode="a", header=False, index=False)

        return summary_row


# Backward-compatible alias
DualPaperTradingEngine = PaperTradingEngine
