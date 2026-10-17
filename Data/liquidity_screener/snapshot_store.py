import os
from datetime import date, datetime, timedelta

import pandas as pd


def _parse_date_from_filename(f: str):
    return datetime.strptime(f.replace(".parquet", ""), "%Y-%m-%d").date()


path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "snapshots")


HIST_DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "historical_data", "data")


def get_point_in_time_universe(target_date_str: str, min_turnover: float = 5_000_000.0) -> pd.DataFrame:
    """
    Computes a point-in-time, survivorship-bias-free liquid universe for any historical date.
    Filters only symbols that were actively trading with genuine turnover on or before target_date.
    """
    target_dt = pd.Timestamp(target_date_str)
    records = []

    if os.path.exists(HIST_DATA_PATH):
        for fname in os.listdir(HIST_DATA_PATH):
            if not fname.endswith(".parquet") or fname.startswith("NSE_NIFTY"):
                continue
            fp = os.path.join(HIST_DATA_PATH, fname)
            try:
                df = pd.read_parquet(fp, columns=["Close", "Volume"])
                if df.empty:
                    continue
                df.index = pd.to_datetime(df.index).tz_localize(None)
                sub = df[df.index <= target_dt].tail(20)
                if len(sub) >= 5:
                    last_row = sub.iloc[-1]
                    recent_turnover = float((sub["Close"] * sub["Volume"]).median())
                    if recent_turnover >= min_turnover and float(last_row["Close"]) > 0:
                        sym = fname.replace(".parquet", "").replace("_", ":")
                        records.append({
                            "symbol": sym,
                            "median_turnover_20d": recent_turnover,
                            "last_close": float(last_row["Close"]),
                        })
            except Exception:
                continue

    if records:
        df_out = pd.DataFrame(records).sort_values(by="median_turnover_20d", ascending=False)
        return df_out
    # Fallback to all available files if turnover threshold yielded empty set
    all_syms = [
        f.replace(".parquet", "").replace("_", ":")
        for f in os.listdir(HIST_DATA_PATH)
        if f.endswith(".parquet") and not f.startswith("NSE_NIFTY")
    ]
    return pd.DataFrame({"symbol": all_syms})


def load_snapshot(target_date_str: str) -> tuple[pd.DataFrame, str]:
    target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
    list_of_snapshots_files = []
    if os.path.exists(path):
        list_of_snapshots_files = [
            f for f in os.listdir(path) if os.path.isfile(os.path.join(path, f))
        ]

    diff_list = []
    for f in sorted(list_of_snapshots_files):
        if f == f"{target_date_str}.parquet":
            df = pd.read_parquet(os.path.join(path, f))
            return df, target_date_str
        file_date = _parse_date_from_filename(f)
        diff = (target_date - file_date).days
        diff_list.append((file_date, diff, f))

    prior_candidates = [
        (file_date, diff, f) for (file_date, diff, f) in diff_list if diff >= 0
    ]

    if not prior_candidates:
        # Eliminate survivorship bias: generate dynamic point-in-time universe for historical dates
        pit_df = get_point_in_time_universe(target_date_str)
        return pit_df, target_date_str

    closest = min(prior_candidates, key=lambda x: x[1])
    resolved_date, _, matched_filename = closest
    df = pd.read_parquet(os.path.join(path, matched_filename))
    return df, resolved_date.strftime("%Y-%m-%d")


def save_snapshot(snapshot_date_str: str, universal_df: pd.DataFrame, overwrite=False):
    file = os.path.join(path, f"{snapshot_date_str}.parquet")
    os.makedirs(path, exist_ok=True)

    if os.path.exists(file) and overwrite == False:
        raise FileExistsError("Snapshot for the date already exists")

    if "symbol" not in universal_df.columns:
        raise ValueError("Symbols don't exist in the dataframe provided")

    universal_df["snapshot_date"] = snapshot_date_str
    universal_df["generated_at"] = datetime.now()

    universal_df.to_parquet(path=file, index=False)

    return file
