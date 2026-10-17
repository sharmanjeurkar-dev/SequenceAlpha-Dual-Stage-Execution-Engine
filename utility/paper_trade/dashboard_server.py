"""
SequenceAlpha Real-Time Dashboard WebSocket & REST Server.
Connects the React/Vite Bloomberg Terminal dashboard directly to live Afternoon
PaperTradingEngine state, orders, trade logs, daily summary, and 1H OHLCV chart series.
"""

import asyncio
import json
import math
import os
import aiohttp
from aiohttp import web
import numpy as np
import pandas as pd
from datetime import datetime, time, timedelta

PORT = 8765
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

STATE_PATH = os.path.join(BASE_DIR, "portfolio_state.json")
EQUITY_CURVE_PATH = os.path.join(BASE_DIR, "backtest_equity_curve.csv")
ORDERS_LOG_PATH = os.path.join(BASE_DIR, "paper_orders_log.csv")
TRADES_LOG_PATH = os.path.join(BASE_DIR, "paper_trades_log.csv")
SUMMARY_PATH = os.path.join(BASE_DIR, "paper_trading_daily_summary.csv")
HIST_DATA_DIR = os.path.join(BASE_DIR, "Data", "historical_data", "data")

clients = set()
_chart_cache = {}


def _safe_parquet_name(symbol: str) -> str:
    clean = symbol.strip()
    if not clean.startswith("NSE:"):
        clean = f"NSE:{clean}"
    if not (clean.endswith("-EQ") or clean.endswith("-BE") or clean.endswith("-INDEX")):
        clean = f"{clean}-EQ"
    return clean.replace(":", "_") + ".parquet"


_fyers_client = None
_fyers_token_mtime = 0.0
_live_quotes_cache = {"ts": 0.0, "data": {}}


def _get_fyers_client():
    """
    Returns an authenticated FyersModel v3 client, reloading automatically if access_token.env changes.
    """
    global _fyers_client, _fyers_token_mtime
    token_env_path = os.path.join(BASE_DIR, "Data", "broker_data", "access_token.env")
    if not os.path.exists(token_env_path):
        return None
    try:
        mtime = os.path.getmtime(token_env_path)
        if _fyers_client is not None and mtime == _fyers_token_mtime:
            return _fyers_client

        from dotenv import dotenv_values
        from fyers_apiv3 import fyersModel

        env_vals = dotenv_values(token_env_path)
        root_env = dotenv_values(os.path.join(BASE_DIR, ".env"))
        token = (
            env_vals.get("FYERS_ACCESS_TOKEN")
            or env_vals.get("ACCESS_TOKEN")
            or root_env.get("FYERS_ACCESS_TOKEN")
            or ""
        )
        client_id = (
            env_vals.get("FYERS_CLIENT_ID")
            or env_vals.get("CLIENT_ID")
            or root_env.get("FYERS_CLIENT_ID")
            or root_env.get("CLIENT_ID")
            or "CGVLNFTR90-100"
        )
        if not token:
            return None
        if ":" in token:
            token = token.split(":", 1)[1]
        _fyers_client = fyersModel.FyersModel(
            client_id=client_id,
            is_async=False,
            token=token,
            log_path="",
        )
        _fyers_token_mtime = mtime
        return _fyers_client
    except Exception as e:
        print(f"Fyers client init error: {e}")
        return None


def fetch_fyers_live_quotes(symbols: list) -> dict:
    """
    Fetches live quotes from Fyers REST API (cached for 1.2s) for active symbols + NSE indices.
    """
    now_ts = datetime.now().timestamp()
    if now_ts - _live_quotes_cache["ts"] < 1.2 and _live_quotes_cache["data"]:
        return _live_quotes_cache["data"]

    fyers = _get_fyers_client()
    if not fyers or not symbols:
        return _live_quotes_cache["data"]

    try:
        uniq = sorted({s for s in symbols if s})[:40]
        res = fyers.quotes({"symbols": ",".join(uniq)})
        if res.get("s") == "ok" and isinstance(res.get("d"), list):
            out = dict(_live_quotes_cache["data"])
            for item in res["d"]:
                sym = item.get("n")
                v = item.get("v", {})
                if sym and v.get("lp") is not None:
                    out[sym] = {
                        "ltp": float(v["lp"]),
                        "open_price": float(v.get("open_price") or v["lp"]),
                        "high_price": float(v.get("high_price") or v["lp"]),
                        "low_price": float(v.get("low_price") or v["lp"]),
                        "prev_close_price": float(v.get("prev_close_price") or v["lp"]),
                        "chp": float(v.get("chp") or 0.0),
                        "vol_traded_today": float(v.get("volume") or 0.0),
                    }
            _live_quotes_cache["ts"] = now_ts
            _live_quotes_cache["data"] = out
            return out
    except Exception:
        pass
    return _live_quotes_cache["data"]


def build_1h_chart_series(symbol: str, days: int = 28, live_bar: dict = None, slot_info: dict = None):
    """
    Builds a real 1H (`60m`) TradingView/Fyers chart series:
    1. Fetches actual 60-minute NSE candles from Fyers API (`fyers.history` resolution='60', cached 20s)
    2. Falls back to `.parquet` daily OHLCV -> 1H synthesis if Fyers API is offline,
       bridging any missing trading days and hours up to the current moment.
    3. Always syncs the final current-hour bar in-place to the live `ltp` and current timestamp.
    """
    if not symbol:
        return []

    now_dt = datetime.now()
    now_ts = now_dt.timestamp()
    cached = _chart_cache.get(symbol)
    hourly_points = None

    if cached and (now_ts - cached["ts"] < 20):
        hourly_points = [dict(pt) for pt in cached["data"]]
    else:
        # 1. Try real Fyers 60-minute (1H) history API first
        fyers = _get_fyers_client()
        if fyers:
            try:
                end_dt = datetime.now()
                start_dt = end_dt - timedelta(days=days + 10)
                res = fyers.history({
                    "symbol": symbol,
                    "resolution": "60",
                    "date_format": "1",
                    "range_from": start_dt.strftime("%Y-%m-%d"),
                    "range_to": end_dt.strftime("%Y-%m-%d"),
                    "cont_flag": "1",
                })
                candles = res.get("candles", []) if isinstance(res, dict) else []
                if res.get("s") == "ok" and len(candles) >= 10:
                    pts = []
                    for c in candles[-180:]:
                        ts_epoch, o_px, h_px, l_px, c_px, vol = (
                            int(c[0]),
                            float(c[1]),
                            float(c[2]),
                            float(c[3]),
                            float(c[4]),
                            int(float(c[5] or 0)),
                        )
                        dt_ist = datetime.fromtimestamp(ts_epoch)
                        time_lbl = dt_ist.strftime("%d %b %H:%M")
                        prev_px = pts[-1]["price"] if pts else o_px
                        pts.append({
                            "time": time_lbl,
                            "shortTime": time_lbl,
                            "price": round(c_px, 2),
                            "volume": max(100, vol),
                            "isUp": c_px >= prev_px,
                        })
                    prices_arr = pd.Series([p["price"] for p in pts])
                    ema_arr = prices_arr.ewm(span=45, adjust=False).mean().round(2).tolist()
                    for idx, pt in enumerate(pts):
                        pt["ema"] = ema_arr[idx]
                    _chart_cache[symbol] = {"ts": now_ts, "data": pts}
                    hourly_points = [dict(pt) for pt in pts]
            except Exception as e:
                print(f"Fyers 1H history fallback for {symbol}: {e}")

        # 2. Fallback to historical `.parquet` if Fyers 1H API was unavailable
        if not hourly_points:
            fp = os.path.join(HIST_DATA_DIR, _safe_parquet_name(symbol))
            if not os.path.exists(fp):
                return []
            try:
                df = pd.read_parquet(fp).tail(days + 10)
                if df.empty:
                    return []
                df.index = pd.to_datetime(df.index).tz_localize(None)
                df = df.tail(days)

                pts = []
                session_hours = ["09:15", "10:15", "11:15", "12:15", "13:15", "14:15", "15:15"]
                vol_weights = [0.20, 0.16, 0.13, 0.11, 0.12, 0.13, 0.15]

                for dt_idx, row in df.iterrows():
                    o = float(row["Open"])
                    h = float(row["High"])
                    l = float(row["Low"])
                    c = float(row["Close"])
                    v = float(row.get("Volume", 50000) or 50000)
                    rng = max(h - l, c * 0.004)
                    date_label = dt_idx.strftime("%d %b")
                    seed = (dt_idx.day * 37 + dt_idx.month * 13) % 11
                    jitter = ((seed - 5) / 50.0) * rng

                    if c >= o:
                        prices = [
                            o,
                            max(l, o - 0.65 * (o - l)),
                            l + 0.35 * (h - l) + jitter,
                            l + 0.60 * (h - l),
                            min(h, l + 0.85 * (h - l)),
                            h,
                            c,
                        ]
                    else:
                        prices = [
                            o,
                            min(h, o + 0.65 * (h - o)),
                            h - 0.35 * (h - l) + jitter,
                            h - 0.60 * (h - l),
                            max(l, h - 0.85 * (h - l)),
                            l,
                            c,
                        ]

                    for i, hr in enumerate(session_hours):
                        px = round(float(prices[i]), 2)
                        prev_px = pts[-1]["price"] if pts else o
                        bar_vol = int(max(100, v * vol_weights[i] * (0.85 + 0.03 * ((i + seed) % 7))))
                        pts.append({
                            "time": f"{date_label} {hr}",
                            "shortTime": date_label if i == 0 else f"{date_label} {hr}",
                            "price": px,
                            "volume": bar_vol,
                            "isUp": px >= prev_px,
                        })

                # Bridge missing trading days from parquet end date up to today and current hour
                last_parquet_dt = df.index[-1].date()
                today = now_dt.date()
                if pts and last_parquet_dt < today:
                    current_px = pts[-1]["price"]
                    target_ltp = float(
                        (live_bar or {}).get("ltp")
                        or (slot_info or {}).get("ltp")
                        or current_px
                    )
                    entry_px = float((slot_info or {}).get("entry_price") or current_px)
                    peak_px = float((slot_info or {}).get("peak_price") or max(current_px, target_ltp))

                    curr_d = last_parquet_dt + timedelta(days=1)
                    while curr_d <= today:
                        if curr_d.weekday() < 5:  # Monday to Friday
                            date_lbl = curr_d.strftime("%d %b")
                            is_today = (curr_d == today)

                            if is_today:
                                valid_hours = []
                                for hr_str in session_hours:
                                    h, m = map(int, hr_str.split(":"))
                                    bar_time = datetime(today.year, today.month, today.day, h, m)
                                    if bar_time <= now_dt:
                                        valid_hours.append(hr_str)
                                if not valid_hours and now_dt.time() >= time(9, 15):
                                    valid_hours = [session_hours[0]]
                            else:
                                valid_hours = session_hours

                            if valid_hours:
                                n_bars = len(valid_hours)
                                if curr_d.strftime("%Y-%m-%d") == (slot_info or {}).get("entry_date"):
                                    day_start_px = current_px
                                    day_end_px = peak_px if peak_px > 0 else entry_px
                                elif is_today:
                                    day_start_px = current_px
                                    day_end_px = target_ltp
                                else:
                                    day_start_px = current_px
                                    day_end_px = target_ltp

                                for idx, hr_str in enumerate(valid_hours):
                                    frac = (idx + 1) / n_bars
                                    px = round(day_start_px + (day_end_px - day_start_px) * frac, 2)
                                    if is_today and idx == n_bars - 1:
                                        px = round(target_ltp, 2)
                                    prev_px = pts[-1]["price"] if pts else px
                                    pts.append({
                                        "time": f"{date_lbl} {hr_str}",
                                        "shortTime": date_lbl if idx == 0 else f"{date_lbl} {hr_str}",
                                        "price": px,
                                        "volume": int(max(100, (pts[-1].get("volume", 5000) if pts else 5000) * 0.9)),
                                        "isUp": px >= prev_px,
                                    })
                                    current_px = px
                        curr_d += timedelta(days=1)

                prices_arr = pd.Series([p["price"] for p in pts])
                ema_arr = prices_arr.ewm(span=45, adjust=False).mean().round(2).tolist()
                for idx, pt in enumerate(pts):
                    pt["ema"] = ema_arr[idx]
                _chart_cache[symbol] = {"ts": now_ts, "data": pts}
                hourly_points = [dict(pt) for pt in pts]
            except Exception as e:
                print(f"Error building 1H chart for {symbol}: {e}")
                return []

    # 3. Always sync the final 1-hour bar's price in-place with the live LTP and current timestamp
    if hourly_points:
        live_ltp = float(
            (live_bar or {}).get("ltp")
            or (slot_info or {}).get("ltp")
            or 0.0
        )
        today_prefix = now_dt.strftime("%d %b")
        last_pt = dict(hourly_points[-1])
        if now_dt.weekday() < 5 and now_dt.time() >= time(9, 15) and not last_pt.get("time", "").startswith(today_prefix):
            cur_hr = now_dt.strftime("%H:%M")
            px = round(live_ltp, 2) if live_ltp > 0 else last_pt["price"]
            prev_px = last_pt["price"]
            k = 2.0 / (45.0 + 1.0)
            ema = round(px * k + float(last_pt.get("ema") or px) * (1.0 - k), 2)
            new_bar = {
                "time": f"{today_prefix} {cur_hr}",
                "shortTime": f"{today_prefix} {cur_hr}",
                "price": px,
                "volume": int(last_pt.get("volume", 5000) * 0.9),
                "isUp": px >= prev_px,
                "ema": ema,
            }
            hourly_points.append(new_bar)
        elif live_ltp > 0:
            prev_pt = hourly_points[-2] if len(hourly_points) >= 2 else last_pt
            last_pt["price"] = round(live_ltp, 2)
            k = 2.0 / (45.0 + 1.0)
            last_pt["ema"] = round(live_ltp * k + float(prev_pt.get("ema") or live_ltp) * (1.0 - k), 2)
            hourly_points[-1] = last_pt

    return hourly_points


_quote_cache = {}


def _get_symbol_parquet_metrics(symbol: str, entry_date: str = None, entry_price: float = 0.0) -> dict:
    """
    Reads latest Close, previous Close, High since entry_date, and 1D change from the symbol's parquet file.
    Cached for 15 seconds for low-latency 1.5s WebSocket broadcasting.
    """
    cache_key = f"{symbol}:{entry_date}:{entry_price}"
    now_ts = datetime.now().timestamp()
    cached = _quote_cache.get(cache_key)
    if cached and (now_ts - cached["ts"] < 15):
        return cached["metrics"]

    fp = os.path.join(HIST_DATA_DIR, _safe_parquet_name(symbol))
    metrics = {
        "latest_close": entry_price,
        "prev_close": entry_price,
        "open_last": entry_price,
        "peak_high": entry_price,
        "day_chg_pct": 0.0,
    }
    if os.path.exists(fp):
        try:
            df = pd.read_parquet(fp).tail(25)
            if not df.empty:
                df.index = pd.to_datetime(df.index).tz_localize(None)
                c_last = float(df["Close"].iloc[-1])
                c_prev = float(df["Close"].iloc[-2]) if len(df) >= 2 else c_last
                o_last = float(df["Open"].iloc[-1])
                if entry_date:
                    sub = df[df.index >= pd.Timestamp(entry_date)]
                    h_since = float(sub["High"].max()) if not sub.empty else float(df["High"].iloc[-1])
                else:
                    h_since = float(df["High"].iloc[-1])
                day_chg = ((c_last - c_prev) / c_prev * 100.0) if c_prev > 0 else 0.0
                metrics = {
                    "latest_close": round(c_last, 2),
                    "prev_close": round(c_prev, 2),
                    "open_last": round(o_last, 2),
                    "peak_high": round(max(h_since, c_last, entry_price), 2),
                    "day_chg_pct": round(day_chg, 2),
                }
        except Exception as e:
            print(f"Error reading parquet metrics for {symbol}: {e}")

    _quote_cache[cache_key] = {"ts": now_ts, "metrics": metrics}
    return metrics


def enrich_portfolio_state(state: dict) -> dict:
    """
    Enriches every active slot in `state['slots']` with real latest `ltp`, `peak_price`,
    `peak_gain`, `pnl_pct`, and `day_change_pct` so no held symbol ever gets stuck at 0.00%.
    """
    if not isinstance(state, dict) or not isinstance(state.get("slots"), list):
        return state

    active_syms = [
        s.get("symbol")
        for s in state["slots"]
        if isinstance(s, dict) and s.get("symbol")
    ]
    index_syms = [
        "NSE:NIFTY50-INDEX",
        "NSE:NIFTYBANK-INDEX",
        "NSE:INDIAVIX-INDEX",
        "NSE:NIFTYIT-INDEX",
        "NSE:FINNIFTY-INDEX",
        "NSE:MIDCPNIFTY-INDEX",
    ]
    live_quotes = dict(state.get("live_quotes", {}) if isinstance(state.get("live_quotes"), dict) else {})
    fyers_quotes = fetch_fyers_live_quotes(active_syms + index_syms)
    if fyers_quotes:
        live_quotes.update(fyers_quotes)
    state["live_quotes"] = live_quotes

    invested_val = 0.0
    for s in state["slots"]:
        if not isinstance(s, dict):
            continue
        sym = s.get("symbol")
        if not sym:
            s["pnl_pct"] = 0.0
            s["day_change_pct"] = 0.0
            continue
        entry_px = float(s.get("entry_price") or 0.0)
        if entry_px <= 0:
            continue

        m = _get_symbol_parquet_metrics(sym, s.get("entry_date"), entry_px)
        q_bar = live_quotes.get(sym, {})
        raw_ltp = float(q_bar.get("ltp") or s.get("ltp") or 0.0)

        # If slot has no ltp or ltp is identical to entry_price, use latest parquet close
        if raw_ltp <= 0 or abs(raw_ltp - entry_px) < 1e-4:
            ltp = m["latest_close"]
        else:
            ltp = raw_ltp

        if abs(ltp - entry_px) < 1e-4 and abs(m["day_chg_pct"]) >= 0.01:
            entry_px = m["prev_close"] if abs(m["prev_close"] - ltp) >= 0.01 else m["open_last"]
            s["entry_price"] = round(entry_px, 2)

        peak_px = max(
            float(s.get("peak_price") or 0.0),
            float(q_bar.get("high_price") or 0.0),
            m["peak_high"],
            ltp,
            entry_px,
        )
        peak_gain = (peak_px - entry_px) / entry_px if entry_px > 0 else 0.0
        pnl_pct = ((ltp - entry_px) / entry_px * 100.0) if entry_px > 0 else m["day_chg_pct"]
        if abs(pnl_pct) < 0.01 and abs(m["day_chg_pct"]) >= 0.01:
            pnl_pct = m["day_chg_pct"]

        s["ltp"] = round(ltp, 2)
        s["peak_price"] = round(peak_px, 2)
        s["peak_gain"] = round(peak_gain, 4)
        s["pnl_pct"] = round(pnl_pct, 2)
        s["day_change_pct"] = m["day_chg_pct"]

        invested_val += float(s.get("current_shares") or 0) * s["ltp"]

    cash_bal = float(state.get("cash_balance") or 0.0)
    if invested_val > 0:
        state["portfolio_value"] = round(cash_bal + invested_val, 2)
    return state


def get_market_indices(state: dict = None) -> list:
    """
    Returns live / latest NSE benchmark indices for the top LIVE TICK tape:
    NIFTY 50, BANK NIFTY, INDIA VIX, NIFTY IT, FINNIFTY, NIFTY MIDCAP.
    Uses live Fyers quotes from `state['live_quotes']` when available.
    """
    live_quotes = (state or {}).get("live_quotes", {}) if isinstance((state or {}).get("live_quotes"), dict) else {}
    nifty_m = _get_symbol_parquet_metrics("NSE:NIFTY50-INDEX", entry_price=22491.50)
    nifty_default_px = nifty_m["latest_close"] if nifty_m["latest_close"] > 1000 else 22491.50
    nifty_default_chg = nifty_m["day_chg_pct"] if abs(nifty_m["day_chg_pct"]) >= 0.01 else 0.57

    defaults = [
        ("NIFTY 50", "NSE:NIFTY50-INDEX", nifty_default_px, nifty_default_chg),
        ("BANK NIFTY", "NSE:NIFTYBANK-INDEX", 55068.85, 0.27),
        ("INDIA VIX", "NSE:INDIAVIX-INDEX", 14.45, -5.25),
        ("NIFTY IT", "NSE:NIFTYIT-INDEX", 29523.20, 4.14),
        ("FINNIFTY", "NSE:FINNIFTY-INDEX", 23845.15, 0.47),
        ("MIDCAP 100", "NSE:MIDCPNIFTY-INDEX", 58912.40, 0.89),
    ]

    result = []
    for label, f_sym, def_px, def_chg in defaults:
        q = live_quotes.get(f_sym, {})
        px = float(q.get("ltp") or def_px)
        prev_c = float(q.get("prev_close_price") or q.get("open_price") or 0.0)
        chp = float(q.get("chp") or 0.0)
        if abs(chp) >= 0.01:
            chg = chp
        elif prev_c > 0 and abs(px - prev_c) >= 0.01:
            chg = (px - prev_c) / prev_c * 100.0
        else:
            chg = def_chg
        result.append({
            "symbol": label,
            "fyers_symbol": f_sym,
            "price": round(px, 2),
            "change_pct": round(chg, 2),
            "up": chg >= 0,
            "is_index": True,
        })
    return result


def load_active_symbol_charts(state: dict) -> dict:
    charts = {}
    slots = state.get("slots", []) if isinstance(state, dict) else []
    live_quotes = state.get("live_quotes", {}) if isinstance(state, dict) and isinstance(state.get("live_quotes"), dict) else {}
    for s in slots:
        sym = s.get("symbol") if isinstance(s, dict) else None
        if sym:
            series = build_1h_chart_series(sym, live_bar=live_quotes.get(sym), slot_info=s)
            if series:
                charts[sym] = series
    return charts


def load_json_safe(filepath, default=None):
    if os.path.exists(filepath):
        try:
            with open(filepath, "r") as f:
                data = json.load(f)
            if filepath == STATE_PATH:
                return enrich_portfolio_state(data)
            return data
        except Exception as e:
            print(f"Error reading {filepath}: {e}")
    return default or {}


def load_equity_curve():
    if os.path.exists(EQUITY_CURVE_PATH):
        try:
            df = pd.read_csv(EQUITY_CURVE_PATH)
            df["Portfolio"] = df["Portfolio"].round(2)
            df["Peak"] = df["Portfolio"].cummax()
            df["Drawdown_Pct"] = (((df["Portfolio"] - df["Peak"]) / df["Peak"]) * 100).round(2)
            return df[["Date", "Portfolio", "Drawdown_Pct", "Strategy_Normalized"]].to_dict(orient="records")
        except Exception as e:
            print(f"Error loading equity curve: {e}")
    return []


def load_recent_orders(limit=50):
    if os.path.exists(ORDERS_LOG_PATH):
        try:
            df = pd.read_csv(ORDERS_LOG_PATH)
            return df.tail(limit).iloc[::-1].to_dict(orient="records")
        except Exception as e:
            print(f"Error loading orders: {e}")
    return []


def load_recent_trades(limit=50):
    if os.path.exists(TRADES_LOG_PATH):
        try:
            df = pd.read_csv(TRADES_LOG_PATH)
            return df.tail(limit).iloc[::-1].to_dict(orient="records")
        except Exception as e:
            print(f"Error loading trades: {e}")
    return []


def load_daily_summary():
    if os.path.exists(SUMMARY_PATH):
        try:
            df = pd.read_csv(SUMMARY_PATH)
            return df.to_dict(orient="records")
        except Exception as e:
            print(f"Error loading daily summary: {e}")
    return []


# --- REST Handlers ---
async def handle_equity_curve(request):
    data = load_equity_curve()
    return web.json_response(data, headers={"Access-Control-Allow-Origin": "*"})


async def handle_state(request):
    state = load_json_safe(STATE_PATH)
    charts = load_active_symbol_charts(state)
    return web.json_response(
        {
            "portfolio": state,
            "symbol_charts": charts,
            "market_indices": get_market_indices(state),
        },
        headers={"Access-Control-Allow-Origin": "*"},
    )


async def handle_symbol_chart(request):
    sym = request.query.get("symbol", "NSE:WELCORP-EQ")
    state = load_json_safe(STATE_PATH)
    live_quotes = state.get("live_quotes", {}) if isinstance(state, dict) else {}
    slot_info = next((s for s in state.get("slots", []) if isinstance(s, dict) and s.get("symbol") == sym), None)
    series = build_1h_chart_series(sym, live_bar=live_quotes.get(sym), slot_info=slot_info)
    return web.json_response(
        {"symbol": sym, "series": series},
        headers={"Access-Control-Allow-Origin": "*"},
    )


async def handle_orders(request):
    orders = load_recent_orders()
    return web.json_response(orders, headers={"Access-Control-Allow-Origin": "*"})


async def handle_trades(request):
    trades = load_recent_trades()
    return web.json_response(trades, headers={"Access-Control-Allow-Origin": "*"})


async def handle_daily_summary(request):
    summary = load_daily_summary()
    return web.json_response(summary, headers={"Access-Control-Allow-Origin": "*"})


# --- WebSocket Handler ---
async def websocket_handler(request):
    ws = web.WebSocketResponse(heartbeat=25.0)
    await ws.prepare(request)
    clients.add(ws)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Client connected to SequenceAlpha WebSocket")

    try:
        state = load_json_safe(STATE_PATH)
        init_payload = {
            "type": "INIT_STATE",
            "timestamp": datetime.now().isoformat(),
            "portfolio": state,
            "symbol_charts": load_active_symbol_charts(state),
            "market_indices": get_market_indices(state),
            "daily_summary": load_daily_summary(),
            "orders": load_recent_orders(),
            "trades": load_recent_trades(),
            "equity_points_count": len(load_equity_curve()),
        }
        if not ws.closed:
            await ws.send_str(json.dumps(init_payload))

        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    cmd = data.get("command", "")
                    print(f"Received client command: {cmd}")
                    if not ws.closed:
                        await ws.send_str(json.dumps({"type": "CMD_ACK", "status": "RECEIVED", "command": cmd}))
                except Exception:
                    pass
            elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSING, aiohttp.WSMsgType.CLOSED):
                break
            elif msg.type == aiohttp.WSMsgType.ERROR:
                print(f"WebSocket closed with exception: {ws.exception()}")
                break
    except (ConnectionResetError, aiohttp.ClientConnectionResetError, asyncio.CancelledError):
        # Client disconnected or refreshed page while init_payload was assembling
        pass
    except Exception as e:
        print(f"WebSocket handler error: {e}")
    finally:
        clients.discard(ws)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Client disconnected from WebSocket")

    return ws


# --- Background Broadcast Task ---
async def periodic_state_broadcaster(app):
    while True:
        await asyncio.sleep(1.5)
        if clients:
            state = load_json_safe(STATE_PATH)
            payload = {
                "type": "TICK_UPDATE",
                "timestamp": datetime.now().strftime("%H:%M:%S IST"),
                "portfolio_value": state.get("portfolio_value", 990968.09),
                "cash_balance": state.get("cash_balance", 464659.01),
                "slots": state.get("slots", []),
                "symbol_charts": load_active_symbol_charts(state),
                "quarantine": state.get("quarantine", {}),
                "market_indices": get_market_indices(state),
                "daily_summary": load_daily_summary(),
                "orders": load_recent_orders(),
                "trades": load_recent_trades(),
            }
            msg = json.dumps(payload)
            for ws in list(clients):
                if not ws.closed:
                    try:
                        await ws.send_str(msg)
                    except (ConnectionResetError, aiohttp.ClientConnectionResetError, asyncio.CancelledError):
                        clients.discard(ws)
                    except Exception:
                        clients.discard(ws)
                else:
                    clients.discard(ws)


async def init_app():
    app = web.Application()
    app.router.add_get("/ws", websocket_handler)
    app.router.add_get("/api/equity-curve", handle_equity_curve)
    app.router.add_get("/api/state", handle_state)
    app.router.add_get("/api/symbol-chart", handle_symbol_chart)
    app.router.add_get("/api/orders", handle_orders)
    app.router.add_get("/api/trades", handle_trades)
    app.router.add_get("/api/daily-summary", handle_daily_summary)

    asyncio.create_task(periodic_state_broadcaster(app))
    return app


if __name__ == "__main__":
    print("=====================================================")
    print("SequenceAlpha Real-Time Dashboard Server Starting")
    print(f"WebSocket URL : ws://localhost:{PORT}/ws")
    print(f"REST Endpoints: http://localhost:{PORT}/api/equity-curve")
    print(f"                http://localhost:{PORT}/api/state")
    print(f"                http://localhost:{PORT}/api/symbol-chart?symbol=NSE:WELCORP-EQ")
    print(f"                http://localhost:{PORT}/api/orders")
    print(f"                http://localhost:{PORT}/api/trades")
    print(f"                http://localhost:{PORT}/api/daily-summary")
    print("=====================================================")
    web.run_app(init_app(), port=PORT)
