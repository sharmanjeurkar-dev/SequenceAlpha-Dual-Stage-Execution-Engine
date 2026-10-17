import os
import sys
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple

import pandas as pd
from dotenv import load_dotenv
from fyers_apiv3.FyersWebsocket import data_ws

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from Data.broker_data.Fyersbrocker import FyersBrocker
from Data.historical_data.historical_data_scraper import (
    HISTORICAL_DATA_PATH,
    _safe_filename,
)
from utility.backtest.generate_backtest_signals import OUTPUT_CACHE_PATH
from utility.paper_trade.dual_paper_trader import PaperTradingEngine
from utility.paper_trade.state_manager import PortfolioStateManager

load_dotenv()
CLIENT_ID = os.getenv("CLIENT_ID", "")
SECRET_ID = os.getenv("SECRET_ID", "")
DATA_TYPE = "SymbolUpdate"

# Persistent in-memory live bar pool and active WebSocket subscription tracker
live_pool_bar: Dict[str, dict] = {}
currently_subscribed: Set[str] = set()
_last_tick_eval_time: float = 0.0
TICK_EVAL_INTERVAL_SEC: float = 1.5

# Track once-per-day automated afternoon milestones
_flushed_1445_date: Optional[str] = None
_rebalanced_1450_date: Optional[str] = None
_audited_1530_date: Optional[str] = None
_milestone_lock = threading.Lock()

broker = FyersBrocker()
access_token = broker.get_token(CLIENT_ID or broker.client_id, SECRET_ID or broker.secret_id)
ws_access_token = (
    f"{broker.client_id}:{access_token}"
    if access_token and ":" not in access_token
    else access_token
)

# Connect directly to the Single-Account Afternoon PaperTradingEngine
paper_engine = PaperTradingEngine(
    state_file="portfolio_state.json",
    orders_log_file="paper_orders_log.csv",
    trades_log_file="paper_trades_log.csv",
    summary_file="paper_trading_daily_summary.csv",
)
portfolio: PortfolioStateManager = paper_engine.mgr


def get_live_prices_snapshot() -> Dict[str, float]:
    """
    Returns a clean {symbol: ltp} snapshot from the pooled WebSocket bars.
    """
    return {
        sym: float(bar["ltp"])
        for sym, bar in live_pool_bar.items()
        if bar.get("ltp") is not None and float(bar["ltp"]) > 0
    }


def onmessage(message):
    """
    Callback function to handle incoming messages from the FyersDataSocket WebSocket.
    Pools live OHLCV + circuit/spread data in memory and runs throttled (every 1.5s)
    intraday stop/target execution + order/trade logging via `paper_engine`.
    """
    global _last_tick_eval_time, _flushed_1445_date, _audited_1530_date

    packets = message if isinstance(message, list) else [message]
    any_pkt_updated = False
    active_symbols = {
        s["symbol"]
        for s in portfolio.state.get("slots", [])
        if s.get("symbol") is not None
    }

    for pkt in packets:
        if not isinstance(pkt, dict):
            continue
        sym = pkt.get("symbol")
        ltp = pkt.get("ltp")
        if sym and ltp is not None:
            prev = live_pool_bar.get(sym, {})
            live_pool_bar[sym] = {
                "ltp": float(ltp),
                "open_price": float(pkt.get("open_price", prev.get("open_price", ltp))),
                "high_price": float(pkt.get("high_price", prev.get("high_price", ltp))),
                "low_price": float(pkt.get("low_price", prev.get("low_price", ltp))),
                "prev_close_price": float(pkt.get("prev_close_price", prev.get("prev_close_price", ltp))),
                "chp": float(pkt.get("chp", prev.get("chp", 0.0))),
                "vol_traded_today": float(pkt.get("vol_traded_today", prev.get("vol_traded_today", 0.0))),
                "upper_ckt": float(pkt.get("upper_ckt", prev.get("upper_ckt", 0.0))),
                "lower_ckt": float(pkt.get("lower_ckt", prev.get("lower_ckt", 0.0))),
                "bid": float(pkt.get("bid", prev.get("bid", ltp))),
                "ask": float(pkt.get("ask", prev.get("ask", ltp))),
                "updated_at": datetime.now().isoformat(),
            }
            any_pkt_updated = True

    # Non-blocking 1.5-second throttle for active portfolio stop/target evaluation & live quote flush
    now = time.time()
    if any_pkt_updated and (now - _last_tick_eval_time >= TICK_EVAL_INTERVAL_SEC):
        _last_tick_eval_time = now
        portfolio.state["live_quotes"] = dict(live_pool_bar)
        current_prices = get_live_prices_snapshot()
        actions = paper_engine.process_intraday_market_ticks(current_prices=current_prices)
        if actions:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Paper Engine Intraday Actions:", actions)
            # If any position was 100% closed, drop its WebSocket subscription automatically
            if any(
                a["action"] in ("EMERGENCY_CUT_100_PERCENT", "TRAILING_STOP_EXIT_REMAINING")
                for a in actions
            ):
                sync_active_subscriptions(fyers, portfolio)

    # Automated afternoon milestones (14:45 parquet candle flush, 14:50 rebalance, & 15:30 EOD audit)
    check_and_run_afternoon_milestones()


def onerror(message):
    """
    Callback function to handle WebSocket errors.
    """
    print("Error:", message)


def onclose(message):
    """
    Callback function to handle WebSocket connection close events.
    """
    print("Connection closed:", message)


def onopen(symbols: Optional[List[str]] = None):
    """
    Callback function to subscribe to active portfolio symbols + NIFTY50 upon WebSocket connection.
    """
    subscribed = sync_active_subscriptions(fyers, portfolio, symbols=symbols)
    if subscribed:
        print(f"Subscribed to {len(subscribed)} symbols on FyersDataSocket: {subscribed}")
        fyers.keep_running()
    else:
        print("No symbols to subscribe for websocket")


def unsubscribe(fyers_socket: data_ws.FyersDataSocket, symbols: List[str]):
    """
    Unsubscribes a list of symbols from the live FyersDataSocket and updates tracker.
    """
    if not symbols:
        return
    fyers_socket.unsubscribe(symbols=symbols, data_type=DATA_TYPE)
    currently_subscribed.difference_update(symbols)


# Keep alias for backward compatibility with earlier draft spelling
unbsubscribe = unsubscribe


def connect(fyers_socket: data_ws.FyersDataSocket):
    """
    Establishes the FyersDataSocket connection and starts the background milestone scheduler.
    """
    _start_milestone_scheduler()
    fyers_socket.connect()


def sync_active_subscriptions(
    fyers_socket: data_ws.FyersDataSocket,
    state_manager: PortfolioStateManager,
    symbols: Optional[List[str]] = None,
) -> Set[str]:
    """
    Synchronizes live WebSocket subscriptions with active portfolio slots + NIFTY50
    (plus any additional symbols explicitly passed in):
    - Subscribes newly added symbols not yet in `currently_subscribed`
    - Unsubscribes symbols that are no longer held in active portfolio slots
    """
    portfolio_state = state_manager.load_state()
    slots = portfolio_state.get("slots", [])

    active_slot_symbols = {
        slot.get("symbol")
        for slot in slots
        if isinstance(slot, dict) and slot.get("symbol") is not None
    }

    desired_symbols: Set[str] = set(active_slot_symbols)
    desired_symbols.update(
        {
            "NSE:NIFTY50-INDEX",
            "NSE:NIFTYBANK-INDEX",
            "NSE:INDIAVIX-INDEX",
            "NSE:NIFTYIT-INDEX",
            "NSE:FINNIFTY-INDEX",
            "NSE:MIDCPNIFTY-INDEX",
        }
    )
    if symbols:
        desired_symbols.update(s for s in symbols if s)

    symbols_to_subscribe = sorted(desired_symbols - currently_subscribed)
    symbols_to_unsubscribe = sorted(currently_subscribed - desired_symbols)

    if symbols_to_unsubscribe:
        try:
            fyers_socket.unsubscribe(symbols=symbols_to_unsubscribe, data_type=DATA_TYPE)
        except Exception:
            pass
        currently_subscribed.difference_update(symbols_to_unsubscribe)
        print(f"Unsubscribed exited symbols: {symbols_to_unsubscribe}")

    if symbols_to_subscribe:
        try:
            fyers_socket.subscribe(symbols=symbols_to_subscribe, data_type=DATA_TYPE)
        except Exception:
            pass
        currently_subscribed.update(symbols_to_subscribe)
        print(f"Subscribed active symbols: {symbols_to_subscribe}")

    return set(currently_subscribed)


def flush_1445_intraday_candles_to_parquet(
    bar_pool: Optional[Dict[str, dict]] = None,
    as_of_date: Optional[str] = None,
) -> int:
    """
    At 14:45 IST, appends/updates today's pooled intraday candle (Open, High, Low, Close=LTP, Volume)
    into each symbol's historical parquet file in `Data/historical_data/data/` so TFT inference
    can run at 14:45 IST before the 14:50 IST afternoon rebalance.
    """
    if bar_pool is None:
        bar_pool = live_pool_bar
    today_ts = pd.Timestamp(as_of_date or datetime.now().strftime("%Y-%m-%d"))
    updated_count = 0

    for sym, bar in bar_pool.items():
        if sym == "NSE:NIFTY50-INDEX":
            continue
        filepath = os.path.join(HISTORICAL_DATA_PATH, _safe_filename(sym))
        if not os.path.exists(filepath):
            continue

        ltp = bar.get("ltp")
        if ltp is None or ltp <= 0:
            continue

        try:
            df = pd.read_parquet(filepath)
            new_row = pd.DataFrame(
                [
                    {
                        "Open": float(bar.get("open_price") or ltp),
                        "High": float(max(bar.get("high_price") or ltp, ltp)),
                        "Low": float(min(bar.get("low_price") or ltp, ltp)),
                        "Close": float(ltp),
                        "Volume": float(bar.get("vol_traded_today") or 0.0),
                    }
                ],
                index=pd.DatetimeIndex([today_ts], name=df.index.name or "Datetime"),
            )
            df = df[df.index != today_ts]
            df = pd.concat([df, new_row]).sort_index()
            df.to_parquet(filepath, index=True)
            updated_count += 1
        except Exception as e:
            print(f"Failed to flush 14:45 candle for {sym}: {e}")

    return updated_count


def is_tradable_at_rebalance(
    symbol: str,
    bar_pool: Optional[Dict[str, dict]] = None,
    max_spread_pct: float = 0.005,
) -> bool:
    """
    Pre-order circuit and liquidity guard before firing a Zerodha Kite order at 14:50 IST:
    - Rejects if LTP is at or above upper circuit (cannot buy)
    - Rejects if bid-ask spread exceeds `max_spread_pct` (default 0.50%)
    """
    if bar_pool is None:
        bar_pool = live_pool_bar
    bar = bar_pool.get(symbol)
    if not bar:
        return False

    ltp = float(bar.get("ltp") or 0.0)
    if ltp <= 0:
        return False

    upper_ckt = float(bar.get("upper_ckt") or 0.0)
    if upper_ckt > 0 and ltp >= upper_ckt:
        return False

    bid = float(bar.get("bid") or 0.0)
    ask = float(bar.get("ask") or 0.0)
    if bid > 0 and ask >= bid:
        spread_pct = (ask - bid) / ltp
        if spread_pct > max_spread_pct:
            return False

    return True


def _resolve_prices_and_vols(symbols: Set[str]) -> Tuple[Dict[str, float], Dict[str, float]]:
    """
    Resolves current prices and 20-day daily volatilities for the requested symbol set:
    1. Live WebSocket snapshot (`live_pool_bar`)
    2. Historical `.parquet` latest Close & 20-day rolling volatility fallback
    """
    prices = get_live_prices_snapshot()
    vols: Dict[str, float] = {}

    for sym in symbols:
        if not sym:
            continue
        filepath = os.path.join(HISTORICAL_DATA_PATH, _safe_filename(sym))
        if os.path.isfile(filepath):
            try:
                df_p = pd.read_parquet(filepath, columns=["Close"])
                if not df_p.empty:
                    closes = df_p["Close"].dropna()
                    if len(closes) >= 2:
                        vol_20d = float(closes.pct_change().tail(20).std())
                        vols[sym] = vol_20d if pd.notna(vol_20d) and vol_20d > 0 else 0.025
                    if sym not in prices and len(closes) >= 1:
                        prices[sym] = float(closes.iloc[-1])
            except Exception:
                pass
        if sym not in vols:
            vols[sym] = 0.025

    return prices, vols


def run_live_1450_rebalance(
    candidates: List[Tuple],
    volatilities: Optional[Dict[str, float]] = None,
    upside_skews: Optional[Dict[str, float]] = None,
    is_bear_regime: bool = False,
    current_prices: Optional[Dict[str, float]] = None,
) -> List[dict]:
    """
    Executes the 14:50 IST Afternoon EOD Rebalance on `paper_engine` using pooled live prices:
    1. Filters candidates through `is_tradable_at_rebalance` (if symbol is in `live_pool_bar`)
    2. Executes Day-5 cohort exits & new cohort entries via `paper_engine.execute_afternoon_rebalance`
    3. Synchronizes live WebSocket subscriptions so new entries are monitored immediately
    """
    tradable_candidates = [
        item
        for item in candidates
        if item[0] not in live_pool_bar or is_tradable_at_rebalance(item[0])
    ]
    if current_prices is None:
        active_syms = {
            s.get("symbol")
            for s in portfolio.state.get("slots", [])
            if isinstance(s, dict) and s.get("symbol")
        }
        cand_syms = {c[0] for c in tradable_candidates[:25]}
        current_prices, resolved_vols = _resolve_prices_and_vols(active_syms | cand_syms)
        if volatilities is None:
            volatilities = resolved_vols

    buys = paper_engine.execute_afternoon_rebalance(
        candidates=tradable_candidates,
        current_prices=current_prices,
        volatilities=volatilities,
        upside_skews=upside_skews,
        is_bear_regime=is_bear_regime,
    )
    sync_active_subscriptions(fyers, portfolio)
    return buys


def load_candidates_and_run_1450_rebalance() -> List[dict]:
    """
    Automatically loads the latest TFT quantile predictions from `Data/cache/tft_oos_predictions.parquet`,
    ranks candidates by `p50_returns_predicted`, resolves live/parquet prices & 20-day volatilities,
    and executes `run_live_1450_rebalance()`.
    """
    if not os.path.exists(OUTPUT_CACHE_PATH):
        print(f"[14:50 Rebalance] Predictions cache not found at {OUTPUT_CACHE_PATH}")
        return []

    preds_df = pd.read_parquet(OUTPUT_CACHE_PATH)
    preds_df["date_str"] = pd.to_datetime(preds_df["date"]).dt.strftime("%Y-%m-%d")
    today_str = datetime.now().strftime("%Y-%m-%d")

    if today_str in set(preds_df["date_str"].unique()):
        target_date = today_str
    else:
        target_date = sorted(preds_df["date_str"].unique())[-1]

    day_preds = preds_df[preds_df["date_str"] == target_date]
    candidates: List[Tuple[str, float, float]] = []
    upside_skews: Dict[str, float] = {}

    for _, r in day_preds.iterrows():
        sym = str(r["symbol"])
        p10 = float(r["p10"])
        p50 = float(r["p50_returns_predicted"])
        p90 = float(r["p90"])
        skew = p90 / max(abs(p10), 1e-4)
        upside_skews[sym] = skew
        candidates.append((sym, p50, skew))

    candidates.sort(key=lambda x: x[1], reverse=True)

    active_syms = {
        s.get("symbol")
        for s in portfolio.state.get("slots", [])
        if isinstance(s, dict) and s.get("symbol")
    }
    cand_syms = {c[0] for c in candidates[:30]}
    current_prices, vols = _resolve_prices_and_vols(active_syms | cand_syms)

    # Filter candidates to symbols that have a valid price
    valid_candidates = [c for c in candidates if c[0] in current_prices]

    buys = run_live_1450_rebalance(
        candidates=valid_candidates,
        volatilities=vols,
        upside_skews=upside_skews,
        is_bear_regime=False,
        current_prices=current_prices,
    )
    print(
        f"[{datetime.now().strftime('%H:%M:%S')}] Executed 14:50 Afternoon Rebalance "
        f"(signal date={target_date}): {len(buys)} new entries -> {[b['symbol'] for b in buys]}"
    )
    return buys


def run_live_1535_daily_audit() -> dict:
    """
    Executes the 15:35 IST Daily Portfolio Summary Audit on `paper_engine` using pooled closing prices.
    """
    active_syms = {
        s.get("symbol")
        for s in portfolio.state.get("slots", [])
        if isinstance(s, dict) and s.get("symbol")
    }
    current_prices, _ = _resolve_prices_and_vols(active_syms)
    return paper_engine.audit_daily_summary(current_prices=current_prices)


def check_and_run_afternoon_milestones() -> None:
    """
    Checks current IST time and triggers once-per-day afternoon milestones:
    - 14:45 IST: Flush pooled intraday candles to `.parquet`
    - 14:50 IST: Execute 14:50 EOD cohort exits & entries
    - 15:30 IST: Execute EOD daily portfolio summary audit
    """
    global _flushed_1445_date, _rebalanced_1450_date, _audited_1530_date

    now_dt = datetime.now()
    today_str = now_dt.strftime("%Y-%m-%d")

    with _milestone_lock:
        if now_dt.hour == 14 and now_dt.minute >= 45 and _flushed_1445_date != today_str:
            _flushed_1445_date = today_str
            flushed = flush_1445_intraday_candles_to_parquet()
            print(f"[{now_dt.strftime('%H:%M:%S')}] Flushed {flushed} live 14:45 candles to parquet.")

        if (
            (now_dt.hour == 14 and now_dt.minute >= 50)
            or (now_dt.hour == 15 and now_dt.minute < 30)
        ) and _rebalanced_1450_date != today_str:
            _rebalanced_1450_date = today_str
            load_candidates_and_run_1450_rebalance()

        if now_dt.hour == 15 and now_dt.minute >= 30 and _audited_1530_date != today_str:
            _audited_1530_date = today_str
            summary = run_live_1535_daily_audit()
            print(f"[{now_dt.strftime('%H:%M:%S')}] Logged EOD Daily Summary:", summary)


def _start_milestone_scheduler() -> None:
    """
    Starts a background daemon thread that checks afternoon milestones every 15 seconds,
    ensuring 14:45, 14:50, and 15:30 fire reliably even if WebSocket ticks pause.
    """
    def _loop():
        while True:
            try:
                check_and_run_afternoon_milestones()
            except Exception as e:
                print(f"[Milestone Scheduler Error] {e}")
            time.sleep(15)

    t = threading.Thread(target=_loop, daemon=True, name="AfternoonMilestoneScheduler")
    t.start()


fyers = data_ws.FyersDataSocket(
    access_token=ws_access_token,
    write_to_file=False,
    log_path="",
    litemode=False,
    reconnect=True,
    on_connect=onopen,
    on_close=onclose,
    on_error=onerror,
    on_message=onmessage,
)


if __name__ == "__main__":
    if "--rebalance-now" in sys.argv:
        load_candidates_and_run_1450_rebalance()
    else:
        connect(fyers)
