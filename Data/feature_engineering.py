import os
import traceback

import numpy as np
import pandas as pd

from Data.historical_data.historical_data_scraper import (
    BENCHMARK_SYMBOL,
    HISTORICAL_DATA_PATH,
    _safe_filename,
)
from Data.label import (
    add_cross_sectional_rank_target,
    add_forward_returns,
    apply_triple_barrier_labels,
)
from Data.liquidity_screener.snapshot_store import load_snapshot

benchmark_filename = _safe_filename(BENCHMARK_SYMBOL)
BENCHMARK_DATA_PATH = os.path.join(HISTORICAL_DATA_PATH, benchmark_filename)


def feature_enginiering(df: pd.DataFrame, symbol) -> pd.DataFrame:
    df["symbol"] = symbol
    df.sort_index(inplace=True)
    df = df.loc[~df.index.duplicated(keep="first")].copy()

    # Calculating the %returns on close price if the share was brought
    df["Returns"] = df["Close"].pct_change()

    # RSI score
    df["Change"] = df["Close"].diff()
    df["Gain"] = np.where(df["Change"] > 0, df["Change"], 0)
    df["Loss"] = np.where(df["Change"] < 0, abs(df["Change"]), 0)

    df["Avg_Gain"] = df["Gain"].ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    df["Avg_Loss"] = df["Loss"].ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()

    df["Rs"] = df["Avg_Gain"] / df["Avg_Loss"]
    df["RSI-close-score"] = 100 - 100 / (1 + df["Rs"])

    df["Intraday_Spread"] = (df["High"] - df["Low"]) / df["Close"]

    # ATR Compressoin Ratio
    df["high_low"] = df["High"] - df["Low"]
    df["high_prev_close"] = (df["High"] - df["Close"].shift(1)).abs()
    df["low_prev_close"] = (df["Low"] - df["Close"].shift(1)).abs()

    df["true_range"] = df[["high_low", "high_prev_close", "low_prev_close"]].max(axis=1)
    df["atr-s"] = df["true_range"].rolling(window=14).mean()
    df["atr-l"] = df["true_range"].rolling(window=50).mean()

    df["ATR-Ratio"] = df["atr-s"] / df["atr-l"]
    df.drop(columns=["high_low", "high_prev_close", "low_prev_close"], inplace=True)

    df.replace([np.inf, -np.inf], np.nan, inplace=True)

    df["Daily_Vol"] = df["Close"].pct_change().rolling(window=25).std()

    # VWAP
    rolling_vwap = (df["Close"] * df["Volume"]).rolling(window=20).sum() / df[
        "Volume"
    ].rolling(window=20).sum()
    df["VWAP-20D-Dist"] = (df["Close"] - rolling_vwap) / rolling_vwap

    # Gap open
    df["Overnight_Gap"] = df["Open"] - df["Close"].shift(1)

    # Gap Fill ratio
    df["Fill"] = df["Close"] - df["Open"]
    df["Gap_Fill_Ratio"] = df["Fill"] / df["Overnight_Gap"]
    df["Gap_Fill_Ratio"] = df["Gap_Fill_Ratio"].replace([np.inf, -np.inf], np.nan)

    # High low distance throughout rolling year
    rolling_252_high = df["Close"].rolling(window=252, min_periods=60).max()
    rolling_252_low = df["Close"].rolling(window=252, min_periods=60).min()
    df["Dist_52W_High"] = df["Close"] - rolling_252_high
    df["Dist_52W_Low"] = df["Close"] - rolling_252_low
    df["Pct_52W_High"] = (df["Close"] - rolling_252_high) / (rolling_252_high + 1e-8)

    # 5-day return (weekly short-term reversal)
    df["Returns_5D"] = df["Close"].pct_change(5)

    # Intraday return (session exhaustion/pressure)
    df["Intraday_Return"] = (df["Close"] - df["Open"]) / (df["Open"] + 1e-8)

    # Intraday spread zscore
    df["Intraday_Spread_MA20"] = df["Intraday_Spread"].rolling(window=20).mean()
    df["Intraday_Spread_STD20"] = df["Intraday_Spread"].rolling(window=20).std()
    df["Intraday_Spread_Zscore"] = (
        df["Intraday_Spread"] - df["Intraday_Spread_MA20"]
    ) / df["Intraday_Spread_STD20"]
    df["Intraday_Spread_Zscore"] = df["Intraday_Spread_Zscore"].replace(
        [np.inf, -np.inf], np.nan
    )
    df["Amihud_Illiquidity"] = df["Returns"] / (df["Close"] * df["Volume"])

    df["EMA-9"] = df["Close"].ewm(span=9, adjust=False).mean()
    df["EMA-21"] = df["Close"].ewm(span=21, adjust=False).mean()

    df["EMA-Cross-Spread"] = (df["EMA-9"] - df["EMA-21"]) / df["Close"]

    df["Sma-50"] = df["Close"].rolling(window=50).mean()
    df["Sma-200"] = df["Close"].rolling(window=200, min_periods=60).mean()

    df["Short-Term-Momentum-ratio"] = df["Close"] / df["Sma-50"]
    df["Long-Term-Momentum-ratio"] = df["Close"] / df["Sma-200"]

    df["Volume-dry-up-ratio"] = df["Volume"].rolling(window=5).mean() / (
        df["Volume"].rolling(window=50).mean() + 1e-8
    )

    df["Close-High-distance-20D"] = (
        df["Close"] - df["Close"].rolling(window=20).max()
    ) / df["Close"].rolling(window=20).max()

    df["Volatility-Contraction"] = (
        df["Close"].rolling(window=20).std() - df["Close"].rolling(window=100).std()
    ) / (df["Close"].rolling(window=100).std() + 1e-8)

    df["Volume-High-distance-20D"] = (
        df["Volume"] - df["Volume"].rolling(window=20).max()
    ) / (df["Volume"].rolling(window=20).max() + 1e-8)
    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df.dropna(inplace=True)
    return df


def add_market_calendar_time_idx(
    df: pd.DataFrame, date_col: str = "Datetime"
) -> pd.DataFrame:
    """
    Map each unique market trading calendar date to an integer time index.
    Guarantees that all symbols on the same date share the exact same timeidx.
    """
    unique_dates = np.sort(df[date_col].unique())
    date_to_idx = {date: idx for idx, date in enumerate(unique_dates)}
    df["timeidx"] = df[date_col].map(date_to_idx).astype(np.int64)
    return df


def add_cross_sectional_standardization(
    df: pd.DataFrame,
    features: list[str],
    date_col: str = "Datetime",
) -> pd.DataFrame:
    """
    Cross-sectionally z-scores features across symbols for each date:
    z = (x - mean_date) / (std_date + 1e-8)
    Ensures relative rank signal stationarity across different market regimes.
    """
    df.index.name = None
    for feat in features:
        if feat in df.columns:
            mean = df.groupby(date_col)[feat].transform("mean")
            std = (
                df.groupby(date_col)[feat].transform("std").fillna(1.0).replace(0, 1.0)
            )
            df[feat] = ((df[feat] - mean) / (std + 1e-8)).astype(np.float32)
    return df


def add_cross_sectional_vol_rank(
    df: pd.DataFrame, vol_col: str = "Daily_Vol", date_col: str = "Datetime"
) -> pd.DataFrame:
    df.index.name = None
    df["Vol_Percentile_Rank"] = df.groupby(date_col)[vol_col].rank(pct=True)
    return df


def add_rolling_beta(
    df: pd.DataFrame,
    relative_index_df: pd.DataFrame,
    window: int = 60,
    return_col: str = "Returns",
) -> pd.DataFrame:
    relative_index_df["Returns"] = relative_index_df["Close"].pct_change()
    benchmark_returns = relative_index_df[return_col]
    df["nifty-50-returns"] = df.index.map(benchmark_returns)

    rolling_cov = df[return_col].rolling(window).cov(df["nifty-50-returns"])
    rolling_var = df["nifty-50-returns"].rolling(window).var()

    df["Beta_60D"] = rolling_cov / rolling_var
    df.drop(columns=["nifty-50-returns"], inplace=True)
    return df


# relative strength with se: nifty-50 index
WINDOW = [60, 120]


def _returns_ND(window: int, price_close: str, df: pd.DataFrame) -> pd.Series:
    """Trailing N-day return: today's price vs. price `window` days ago."""
    return (df[price_close] / df[price_close].shift(window)) - 1


def add_relative_strength(
    df: pd.DataFrame, relative_index_df: pd.DataFrame, window: list[int] = WINDOW
) -> pd.DataFrame:
    """
    Adds a relative_strength column to df (a single stock's feature
    dataframe, indexed by Datetime). relative_index_df is the benchmark's
    (Nifty 50) dataframe, loaded ONCE by the caller and passed in here --
    this function must never fetch the benchmark itself.
    """
    for w in window:
        stock_returns_ND = _returns_ND(window=w, price_close="Close", df=df)
        benchmark_close = relative_index_df["Close"]
        df["nifty-50-close"] = df.index.map(benchmark_close)

        benchmark_returns_ND = _returns_ND(
            window=w, price_close="nifty-50-close", df=df
        )

        df[f"relative_strength_{w}d"] = stock_returns_ND - benchmark_returns_ND
    # +ve: stock outperformed the market over the window
    # -ve: stock underperformed the market over the window

    df.drop(columns=["nifty-50-close"], inplace=True)
    df.dropna(inplace=True)

    return df


def add_macro_regime_features(
    df: pd.DataFrame, benchmark_df: pd.DataFrame, date_col: str = "Datetime"
) -> pd.DataFrame:
    """
    Appends broad market macro regime indicators (Nifty 50 200D trend, annualized 20D vol,
    and universe market breadth) to each row. Enables temporal neural networks to differentiate
    bull trends from consolidation and high-volatility drawdown regimes.
    """
    b_df = benchmark_df.copy()
    b_df.index = pd.to_datetime(b_df.index).tz_localize(None)
    b_df = b_df.sort_index()

    b_sma_200 = b_df["Close"].rolling(200, min_periods=60).mean()
    b_df["Macro_Nifty_Trend_200D"] = (
        (b_df["Close"] - b_sma_200) / (b_sma_200 + 1e-8)
    ).astype(np.float32)

    b_ret = b_df["Close"].pct_change()
    b_df["Macro_Nifty_Vol_20D"] = (
        b_ret.rolling(20, min_periods=10).std() * np.sqrt(252)
    ).astype(np.float32)

    trend_map = b_df["Macro_Nifty_Trend_200D"].to_dict()
    vol_map = b_df["Macro_Nifty_Vol_20D"].to_dict()

    dt_series = pd.to_datetime(df[date_col])
    df["Macro_Nifty_Trend_200D"] = (
        dt_series.map(trend_map).fillna(0.0).astype(np.float32)
    )
    df["Macro_Nifty_Vol_20D"] = (
        dt_series.map(vol_map).fillna(0.15).astype(np.float32)
    )

    # Market Breadth: fraction of universe stocks trading above their 50D SMA on date t
    if "Sma-50" in df.columns and "Close" in df.columns:
        above_50 = (df["Close"] > df["Sma-50"]).astype(float)
        breadth = above_50.groupby(df[date_col]).transform("mean")
        df["Market_Breadth_SMA50"] = breadth.fillna(0.5).astype(np.float32)
    else:
        df["Market_Breadth_SMA50"] = np.float32(0.5)

    return df


def build_training_set(
    snapshot_date: str,
    target_type: str = "cross_sectional_rank",
    forward_horizon: int = 5,
    standardize_features: bool = True,
    labeling_kwargs: dict | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    universe_df, resolved_date = load_snapshot(snapshot_date)
    symbols = universe_df["symbol"].tolist()

    benchmark_df = pd.read_parquet(BENCHMARK_DATA_PATH)
    processed_dataframes = []
    failed_symbols = []
    failure_reason = []

    for symbol in symbols:
        file_name = _safe_filename(symbol)
        file = os.path.join(HISTORICAL_DATA_PATH, file_name)

        if not os.path.isfile(file):
            failed_symbols.append(symbol)
            failure_reason.append(
                f"File doesn't exist for symbol:{symbol} at location: {file}"
            )
            continue

        df = pd.read_parquet(file)
        if df.empty:
            failed_symbols.append(symbol)
            failure_reason.append(f"Dataframe for symbol: {symbol} found but is empty")
            continue
        try:
            df = feature_enginiering(df, symbol)
            df = add_relative_strength(df, benchmark_df, window=WINDOW)
            df = add_rolling_beta(df, benchmark_df, window=60)
            if target_type in ("cross_sectional_rank", "forward_rank", "rank", "forward_return"):
                df = add_forward_returns(df, horizon=forward_horizon, col_name="Target")
            else:
                tb_kwargs = labeling_kwargs or {}
                df = apply_triple_barrier_labels(df, **tb_kwargs)
            df["symbol"] = symbol
            processed_dataframes.append(df)

        except Exception as e:
            failed_symbols.append(symbol)
            failure_reason.append("Failure in preprocessing of data")
            print(f"Exception occured \n {traceback.extract_tb(e.__traceback__)}")

    if not processed_dataframes:
        raise ValueError("No symbols were successfully processed")

    final_df = pd.concat(processed_dataframes, axis=0)
    if "Datetime" not in final_df.columns:
        final_df["Datetime"] = final_df.index
    final_df.index.name = None

    # Macro regime conditioning (A.2)
    final_df = add_macro_regime_features(final_df, benchmark_df, date_col="Datetime")

    # Cross-sectional rank target normalization (New Target [-1.0, +1.0])
    if target_type in ("cross_sectional_rank", "forward_rank", "rank"):
        final_df["Raw_Forward_Return"] = final_df["Target"].copy()
        final_df = add_cross_sectional_rank_target(
            final_df,
            date_col="Datetime",
            raw_return_col="Raw_Forward_Return",
            out_col="Target",
            scale_range=(-1.0, 1.0),
        )
    elif "Target" in final_df.columns:
        final_df["Raw_Forward_Return"] = final_df["Target"].copy()

    final_df = add_cross_sectional_vol_rank(final_df)
    final_df = add_market_calendar_time_idx(final_df, date_col="Datetime")

    if standardize_features:
        features_to_standardize = [
            "Intraday_Spread",
            "ATR-Ratio",
            "Intraday_Spread_Zscore",
            "RSI-close-score",
            "relative_strength_60d",
            "relative_strength_120d",
            "Beta_60D",
            "Pct_52W_High",
            "Returns_5D",
            "Intraday_Return",
            "EMA-Cross-Spread",
            "Short-Term-Momentum-ratio",
            "Long-Term-Momentum-ratio",
            "Volume-dry-up-ratio",
            "Close-High-distance-20D",
            "Volatility-Contraction",
            "Volume-High-distance-20D",
        ]
        final_df = add_cross_sectional_standardization(
            final_df, features_to_standardize, date_col="Datetime"
        )

    if failed_symbols:
        print(f"{len(failed_symbols)} symbols failed: {failed_symbols}")

    failure_df = pd.DataFrame(
        {"Failed symbols": failed_symbols, "Failure Reason": failure_reason}
    )
    return final_df, failure_df


def walk_forward_out_of_sample_dataframe_slices(
    df: pd.DataFrame,
    startDate=None,
    endDate=None,
    jump: int = 3,
    max_days: int = 10,
    min_train_months: int = 15,
    encoder_buffer_trading_days: int = 20,
) -> list[list[pd.DataFrame]]:
    """
    Slices an expanding-window walk-forward dataset for out-of-sample temporal model evaluation.
    Enforces a minimum initial training window (default 15 months for 5-year cycle, 15 folds) so 
    rolling indicators are fully formed, with strict embargo separation and prepended encoder buffer history.
    """
    if startDate is None:
        startDate = df.index.min()
    if endDate is None:
        endDate = df.index.max()

    all_dates = pd.Series(df.index.unique()).sort_values().reset_index(drop=True)

    total_months = (endDate.year - startDate.year) * 12 + (
        endDate.month - startDate.month
    )
    effective_min_train_months = min(min_train_months, max(jump, total_months - jump))

    dfcollection = []
    for i in range(0, max(1, total_months - effective_min_train_months), jump):
        nextSetEndDate = startDate + pd.DateOffset(months=effective_min_train_months + i)
        nextSetEndDateWithoutEmbargo = nextSetEndDate - pd.DateOffset(days=max_days)
        testNextSetEndDate = nextSetEndDate + pd.DateOffset(months=jump)

        train_mask = (df.index >= startDate) & (
            df.index <= nextSetEndDateWithoutEmbargo
        )

        test_dates_before_split = all_dates[all_dates < nextSetEndDate]
        if len(test_dates_before_split) >= encoder_buffer_trading_days:
            buffer_start_date = test_dates_before_split.iloc[
                -encoder_buffer_trading_days
            ]
        else:
            buffer_start_date = all_dates.iloc[0]

        if testNextSetEndDate <= endDate:
            test_mask = (df.index >= buffer_start_date) & (
                df.index <= testNextSetEndDate
            )
            test_slice = df[test_mask].copy()
            test_slice.attrs["eval_start_date"] = nextSetEndDate
            dfcollection.append([df[train_mask], test_slice])
        else:
            test_mask_final = (df.index >= buffer_start_date) & (df.index <= endDate)
            test_slice = df[test_mask_final].copy()
            test_slice.attrs["eval_start_date"] = nextSetEndDate
            dfcollection.append([df[train_mask], test_slice])
            print("All sets before the end date covered")
            break

    return dfcollection
