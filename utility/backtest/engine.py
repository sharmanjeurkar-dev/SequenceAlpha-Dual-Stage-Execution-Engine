"""
Backtrader Event-Driven Backtesting Engine for SequenceAlpha (Chunk 8).
Simulates realistic execution, portfolio sizing, transaction costs, and slippage.
"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import backtrader as bt
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

try:
    from utility.backtest.commission import NSEEquityCommissionScheme
    from utility.backtest.data_feed import TFTData
    from utility.backtest.strategy import TFTRollingCohortsStrategy, TFTTopNStrategy
except ImportError:
    from commission import NSEEquityCommissionScheme
    from data_feed import TFTData
    from strategy import TFTRollingCohortsStrategy, TFTTopNStrategy


from Data.historical_data.historical_data_scraper import (
    HISTORICAL_DATA_PATH,
    _safe_filename,
)
from utility.backtest.generate_backtest_signals import (
    OUTPUT_CACHE_PATH,
    generate_oos_predictions,
)


def load_candidate_feeds(oos_predictions_df):
    """
    Loads OHLCV price histories merged with model predictions for candidate stocks.
    Ensures all feeds share the exact same trading calendar index so Backtrader starts
    immediately on the first out-of-sample date without timeline skew.
    """
    trading_calendar = pd.DatetimeIndex(sorted(oos_predictions_df["date"].unique()))
    symbols = oos_predictions_df["symbol"].unique()
    print(f"Preparing Backtrader data feeds across {len(symbols)} candidate symbols...")
    print(
        f"Master trading calendar: {len(trading_calendar)} dates ({trading_calendar[0].date()} to {trading_calendar[-1].date()})"
    )

    data_feeds = {}
    for sym in symbols:
        safe_name = _safe_filename(sym)
        file_path = os.path.join(HISTORICAL_DATA_PATH, safe_name)
        if not os.path.isfile(file_path):
            continue

        price_df = pd.read_parquet(file_path)
        if price_df.empty:
            continue

        price_df.index = pd.to_datetime(price_df.index)
        if price_df.index.tz is not None:
            price_df.index = price_df.index.tz_localize(None)

        # Merge with symbol's out-of-sample predictions
        sym_preds = oos_predictions_df[oos_predictions_df["symbol"] == sym].copy()
        sym_preds["date"] = pd.to_datetime(sym_preds["date"])
        if sym_preds["date"].dt.tz is not None:
            sym_preds["date"] = sym_preds["date"].dt.tz_localize(None)
        sym_preds = sym_preds.set_index("date")

        merged = price_df.join(
            sym_preds[["p10", "p50_returns_predicted", "p90"]], how="left"
        )
        merged = merged.reindex(trading_calendar)

        # Clean price continuity: forward-fill trading prices and zero volume for unlisted days
        price_cols = ["Open", "High", "Low", "Close"]
        merged[price_cols] = merged[price_cols].ffill().bfill()
        if "Volume" in merged.columns:
            merged["Volume"] = merged["Volume"].fillna(0.0)

        feed = TFTData(dataname=merged, name=sym)
        data_feeds[sym] = feed

    print(
        f"✓ Loaded {len(data_feeds)} valid data feeds aligned to {len(trading_calendar)} bars."
    )
    return data_feeds


def run_backtest(
    initial_cash=1_000_000.0,
    cohort_size=3,
    total_positions=15,
    holding_bars=5,
    slippage_perc=0.0005,  # 5 bps slippage
    verbose=False,
    max_symbols=None,
):
    """
    Executes the full event-driven Backtrader simulation using Rolling Cohorts (Strategy C).
    """
    print("=" * 65)
    print("SEQUENCE ALPHA: ROLLING COHORTS PORTFOLIO SIMULATION")
    print("=" * 65)
    print(f"Starting Capital:   ₹{initial_cash:,.2f}")
    print(f"Holding Horizon:    {holding_bars} trading days (H=5)")
    print(
        f"Portfolio Sizing:   {total_positions} active stocks ({cohort_size} added daily)"
    )
    print(f"Execution Slippage: {slippage_perc * 10000:.1f} bps")
    print(f"Cost Model:         NSE Delivery (STT 0.1%, Brokerage, GST, Stamp)")
    print("=" * 65)

    # 1. Load out-of-sample prediction table
    if not os.path.exists(OUTPUT_CACHE_PATH):
        print("Out-of-sample predictions cache not found. Generating now...")
        oos_df = generate_oos_predictions()
    else:
        print(f"Loading predictions from cache: {OUTPUT_CACHE_PATH}")
        oos_df = pd.read_parquet(OUTPUT_CACHE_PATH)

    # Filter symbols if max_symbols specified
    if max_symbols is not None:
        top_syms = oos_df["symbol"].value_counts().head(max_symbols).index
        oos_df = oos_df[oos_df["symbol"].isin(top_syms)]

    # 2. Build data feeds
    feeds = load_candidate_feeds(oos_df)
    if not feeds:
        raise RuntimeError("No valid data feeds could be created!")

    # 3. Initialize Cerebro
    cerebro = bt.Cerebro()
    cerebro.broker.setcash(initial_cash)
    cerebro.broker.addcommissioninfo(NSEEquityCommissionScheme())
    cerebro.broker.set_slippage_perc(slippage_perc)
    cerebro.broker.set_coc(True)  # Cheat-On-Close: instant settlement of sales into available cash

    # Add Strategy: Rolling Overlapping Cohorts
    cerebro.addstrategy(
        TFTRollingCohortsStrategy,
        total_positions=total_positions,
        holding_bars=holding_bars,
        daily_cohort_size=cohort_size,
        cash_buffer=0.05,
        verbose=verbose,
    )

    # Add Candidate Stock Data feeds
    for sym, feed in feeds.items():
        cerebro.adddata(feed, name=sym)

    # Add Analyzers
    cerebro.addanalyzer(
        bt.analyzers.SharpeRatio,
        _name="sharpe",
        timeframe=bt.TimeFrame.Days,
        annualize=True,
        riskfreerate=0.065,  # 6.5% Indian 10Y benchmark
    )
    cerebro.addanalyzer(bt.analyzers.DrawDown, _name="drawdown")
    cerebro.addanalyzer(bt.analyzers.Returns, _name="returns")
    cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name="trades")
    cerebro.addanalyzer(bt.analyzers.TimeReturn, _name="timereturn")

    print("\nRunning Backtrader engine...")
    start_time = datetime.now()
    results = cerebro.run()
    elapsed = datetime.now() - start_time
    strat = results[0]

    final_val = cerebro.broker.getvalue()
    net_pnl = final_val - initial_cash
    total_return_pct = (net_pnl / initial_cash) * 100

    # 4. Extract Analyzer Metrics
    sharpe_dict = strat.analyzers.sharpe.get_analysis()
    sharpe_val = sharpe_dict.get("sharperatio", np.nan)

    dd_dict = strat.analyzers.drawdown.get_analysis()
    max_dd = dd_dict.get("max", {}).get("drawdown", np.nan)
    max_dd_len = dd_dict.get("max", {}).get("len", np.nan)

    ret_dict = strat.analyzers.returns.get_analysis()
    cagr = ret_dict.get("rnorm100", np.nan)

    trades_dict = strat.analyzers.trades.get_analysis()
    total_trades = trades_dict.get("total", {}).get("closed", 0)
    won_trades = trades_dict.get("won", {}).get("total", 0)
    lost_trades = trades_dict.get("lost", {}).get("total", 0)
    win_rate = (won_trades / total_trades * 100) if total_trades > 0 else np.nan
    pnl_won = trades_dict.get("won", {}).get("pnl", {}).get("total", 0.0)
    pnl_lost = abs(trades_dict.get("lost", {}).get("pnl", {}).get("total", 1e-8))
    profit_factor = (pnl_won / pnl_lost) if pnl_lost > 0 else np.nan

    print("\n" + "=" * 65)
    print("BACKTRADER SIMULATION PERFORMANCE SUMMARY")
    print("=" * 65)
    print(f"Simulation Time:    {elapsed.total_seconds():.1f} seconds")
    print(f"Starting Capital:   ₹{initial_cash:,.2f}")
    print(f"Ending Portfolio:   ₹{final_val:,.2f}")
    print(f"Net Profit / Loss:  ₹{net_pnl:+,.2f} ({total_return_pct:+.2f}%)")
    print(f"Annualized Return:  {cagr:.2f}% CAGR")
    print(f"Annualized Sharpe:  {sharpe_val:.2f} (Risk-Free: 6.5%)")
    print(f"Max Drawdown:       {max_dd:.2f}% (Duration: {max_dd_len} bars)")
    print(f"Total Closed Trades:{total_trades}")
    print(f"Winning Trades:     {won_trades} ({win_rate:.1f}%)")
    print(f"Losing Trades:      {lost_trades}")
    print(f"Profit Factor:      {profit_factor:.2f}")
    print("=" * 65)

    # Save summary CSV
    summary_data = {
        "Metric": [
            "Starting Capital",
            "Ending Capital",
            "Net Profit",
            "Total Return %",
            "CAGR %",
            "Sharpe Ratio",
            "Max Drawdown %",
            "Max Drawdown Bars",
            "Total Trades",
            "Winning Trades",
            "Trade Win Rate %",
            "Profit Factor",
        ],
        "Value": [
            f"₹{initial_cash:,.2f}",
            f"₹{final_val:,.2f}",
            f"₹{net_pnl:+,.2f}",
            f"{total_return_pct:+.2f}%",
            f"{cagr:.2f}%",
            f"{sharpe_val:.2f}" if not np.isnan(sharpe_val) else "N/A",
            f"{max_dd:.2f}%",
            f"{max_dd_len}",
            f"{total_trades}",
            f"{won_trades}",
            f"{win_rate:.1f}%",
            f"{profit_factor:.2f}" if not np.isnan(profit_factor) else "N/A",
        ],
    }

    pd.DataFrame(summary_data).to_csv("Backtrader_Portfolio_Summary.csv", index=False)
    print("✓ Saved summary metrics to Backtrader_Portfolio_Summary.csv")

    # Save detailed trade execution ledger
    trades_df = pd.DataFrame(strat.closed_trades)
    if not trades_df.empty:
        trades_df.to_csv("backtest_trades_log.csv", index=False)
        print(f"✓ Saved {len(trades_df):,} detailed trades to backtest_trades_log.csv")

    # Save detailed order execution ledger
    orders_df = pd.DataFrame(strat.all_orders)
    if not orders_df.empty:
        orders_df.to_csv("backtest_orders_log.csv", index=False)
        print(f"✓ Saved {len(orders_df):,} executed orders to backtest_orders_log.csv")

    # 5. Plot Portfolio Equity Curve vs Nifty 50 Benchmark
    plot_equity_curve(strat, initial_cash)

    return {
        "final_value": final_val,
        "net_pnl": net_pnl,
        "total_return_pct": total_return_pct,
        "sharpe": sharpe_val,
        "max_drawdown": max_dd,
        "cagr": cagr,
        "trades": total_trades,
        "win_rate": win_rate,
        "profit_factor": profit_factor,
    }


def plot_equity_curve(strat, initial_cash):
    """
    Plots the daily strategy portfolio equity curve against Nifty 50 index benchmark.
    """
    dates = strat.daily_dates
    values = strat.daily_values

    if not dates or not values:
        return

    eq_df = pd.DataFrame(
        {"Date": pd.to_datetime(dates), "Portfolio": values}
    ).set_index("Date")
    eq_df = eq_df[~eq_df.index.duplicated(keep="first")]
    eq_df["Strategy_Normalized"] = (eq_df["Portfolio"] / initial_cash) * 100
    eq_df.to_csv("backtest_equity_curve.csv")

    # Load Nifty 50 benchmark
    benchmark_path = "Data/historical_data/data/NSE_NIFTY50-INDEX.parquet"
    if os.path.exists(benchmark_path):
        bench_df = pd.read_parquet(benchmark_path)
        bench_df.index = pd.to_datetime(bench_df.index)
        if bench_df.index.tz is not None:
            bench_df.index = bench_df.index.tz_localize(None)

        common_idx = eq_df.index.intersection(bench_df.index)
        if len(common_idx) > 10:
            sub_bench = bench_df.loc[common_idx]
            sub_strat = eq_df.loc[common_idx]
            bench_norm = (sub_bench["Close"] / sub_bench["Close"].iloc[0]) * 100

            plt.figure(figsize=(12, 6))
            plt.plot(
                sub_strat.index,
                sub_strat["Strategy_Normalized"],
                label="TFT Rolling Cohorts (Top-3 Daily, Net of Costs)",
                color="#2ca02c",
                lw=2,
            )
            plt.plot(
                sub_bench.index,
                bench_norm,
                label="Nifty 50 Index (Benchmark)",
                color="#ff7f0e",
                lw=1.5,
                ls="--",
            )
            plt.title(
                "SequenceAlpha: AlphaHarvest-Trailing Strategy vs Nifty 50 (Event-Driven)",
                fontsize=14,
                fontweight="bold",
            )
            plt.xlabel("Date", fontsize=11)
            plt.ylabel("Portfolio Value (Indexed to 100)", fontsize=11)
            plt.grid(True, alpha=0.3)
            plt.legend(fontsize=11)
            plt.tight_layout()
            os.makedirs("graphs", exist_ok=True)
            plt.savefig("graphs/backtest_equity_curve.png", dpi=300)
            plt.close()
            print("✓ Saved equity curve comparison to graphs/backtest_equity_curve.png")
            return

    # Fallback plot without benchmark
    plt.figure(figsize=(12, 6))
    plt.plot(
        eq_df.index,
        eq_df["Strategy_Normalized"],
        label="AlphaHarvest-Trailing Strategy",
        color="#1f77b4",
        lw=2,
    )
    plt.title(
        "SequenceAlpha AlphaHarvest Strategy: Equity Curve", fontsize=14, fontweight="bold"
    )
    plt.xlabel("Date", fontsize=11)
    plt.ylabel("Portfolio Value (Indexed to 100)", fontsize=11)
    plt.grid(True, alpha=0.3)
    plt.legend(fontsize=11)
    plt.tight_layout()
    os.makedirs("graphs", exist_ok=True)
    plt.savefig("graphs/backtest_equity_curve.png", dpi=300)
    plt.close()
    print("✓ Saved equity curve to graphs/backtest_equity_curve.png")


if __name__ == "__main__":
    run_backtest()
