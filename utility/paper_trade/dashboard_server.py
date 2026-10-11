"""
SequenceAlpha Real-Time Dashboard WebSocket & REST Server.
Connects the React/Vite Bloomberg Terminal dashboard directly to live Afternoon
PaperTradingEngine state, orders, trade logs, daily summary, and historical equity curves.
"""

import asyncio
import json
import os
import aiohttp
from aiohttp import web
import pandas as pd
from datetime import datetime

PORT = 8765
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

STATE_PATH = os.path.join(BASE_DIR, "portfolio_state.json")
EQUITY_CURVE_PATH = os.path.join(BASE_DIR, "backtest_equity_curve.csv")
ORDERS_LOG_PATH = os.path.join(BASE_DIR, "paper_orders_log.csv")
TRADES_LOG_PATH = os.path.join(BASE_DIR, "paper_trades_log.csv")
SUMMARY_PATH = os.path.join(BASE_DIR, "paper_trading_daily_summary.csv")

clients = set()


def load_json_safe(filepath, default=None):
    if os.path.exists(filepath):
        try:
            with open(filepath, "r") as f:
                return json.load(f)
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
    return web.json_response({"portfolio": state}, headers={"Access-Control-Allow-Origin": "*"})


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
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    clients.add(ws)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Client connected to SequenceAlpha WebSocket")

    try:
        init_payload = {
            "type": "INIT_STATE",
            "timestamp": datetime.now().isoformat(),
            "portfolio": load_json_safe(STATE_PATH),
            "daily_summary": load_daily_summary(),
            "orders": load_recent_orders(),
            "trades": load_recent_trades(),
            "equity_points_count": len(load_equity_curve()),
        }
        await ws.send_str(json.dumps(init_payload))

        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                data = json.loads(msg.data)
                cmd = data.get("command", "")
                print(f"Received client command: {cmd}")
                await ws.send_str(json.dumps({"type": "CMD_ACK", "status": "RECEIVED", "command": cmd}))
            elif msg.type == aiohttp.WSMsgType.ERROR:
                print(f"WebSocket closed with exception {ws.exception()}")
    finally:
        clients.remove(ws)
        print("Client disconnected from WebSocket")

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
                "portfolio_value": state.get("portfolio_value", 993941.81),
                "cash_balance": state.get("cash_balance", 363715.01),
                "slots": state.get("slots", []),
                "quarantine": state.get("quarantine", {}),
                "daily_summary": load_daily_summary(),
                "orders": load_recent_orders(),
                "trades": load_recent_trades(),
            }
            msg = json.dumps(payload)
            for ws in list(clients):
                if not ws.closed:
                    try:
                        await ws.send_str(msg)
                    except Exception:
                        pass


async def init_app():
    app = web.Application()
    app.router.add_get("/ws", websocket_handler)
    app.router.add_get("/api/equity-curve", handle_equity_curve)
    app.router.add_get("/api/state", handle_state)
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
    print(f"                http://localhost:{PORT}/api/orders")
    print(f"                http://localhost:{PORT}/api/trades")
    print(f"                http://localhost:{PORT}/api/daily-summary")
    print("=====================================================")
    web.run_app(init_app(), port=PORT)
