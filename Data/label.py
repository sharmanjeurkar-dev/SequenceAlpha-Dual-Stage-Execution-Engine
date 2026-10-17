import numpy as np
import pandas as pd


def add_forward_returns(
    df: pd.DataFrame,
    horizon: int = 1,
    col_name: str = "Target",
    price_col: str = "Close",
) -> pd.DataFrame:
    """
    Computes clean forward holding period return:
    Target_t = (Close_{t + horizon} - Close_t) / Close_t
    Suitable for cross-sectional ranking and decile spread strategies.
    """
    out = df.copy()
    out[col_name] = (out[price_col].shift(-horizon) - out[price_col]) / out[price_col]
    return out


def add_cross_sectional_rank_target(
    df: pd.DataFrame,
    date_col: str = "Datetime",
    raw_return_col: str = "Target",
    out_col: str = "Target",
    scale_range: tuple = (-1.0, 1.0),
) -> pd.DataFrame:
    """
    Normalizes forward returns into daily cross-sectional percentile ranks:
    Target in [-1.0, +1.0] where +1.0 = top performer of the universe on that day,
    -1.0 = worst performer, and 0.0 = median.

    Formula for stock i on date t across N_t valid stocks:
        pct_rank = (rank - 1.0) / (N_t - 1.0)      # in [0.0, 1.0]
        target = low + pct_rank * (high - low)     # in [-1.0, +1.0]

    Protects neural networks and rank strategies from:
    1. Extreme idiosyncratic outlier distortions (e.g. +450% meme runs).
    2. Non-stationarity across bull and bear market regimes.
    3. Overfitting to broad market beta drift.
    """
    out = df.copy()
    if raw_return_col not in out.columns:
        raise KeyError(f"Column '{raw_return_col}' not found in dataframe")

    low, high = scale_range
    scale_span = high - low

    def _rank_group(series: pd.Series) -> pd.Series:
        valid_mask = series.notna()
        n = valid_mask.sum()
        if n <= 1:
            return pd.Series(0.0, index=series.index)
        ranks = series.rank(method="average", ascending=True)
        pct = (ranks - 1.0) / (n - 1.0)
        return low + pct * scale_span

    out[out_col] = (
        out.groupby(date_col)[raw_return_col]
        .transform(_rank_group)
        .astype(np.float32)
    )
    return out


def apply_triple_barrier_labels(
    df: pd.DataFrame,
    vol_col="Daily_Vol",
    max_days: int = 8,
    profit_mult: float = 1.5,
    stop_mult: float = 1.0,
    price_close: str = "Close",
    high_col: str = "High",
    low_col: str = "Low",
    use_exact_barrier_prices: bool = True,
) -> pd.DataFrame:
    n = len(df)
    close = df[price_close].values
    high = df[high_col].values
    low = df[low_col].values
    vol = df[vol_col].values

    upper_barrier = close * (1 + (profit_mult * vol))
    lower_barrier = close * (1 - (stop_mult * vol))

    upper_touch_day, lower_touch_day = compute_touch_days(
        high, low, upper_barrier, lower_barrier, max_days
    )

    full_window_mask = (np.arange(n) + max_days) < n

    upper_hit = ~np.isnan(upper_touch_day) & full_window_mask
    lower_hit = ~np.isnan(lower_touch_day) & full_window_mask

    collision_mask = upper_hit & lower_hit & (upper_touch_day == lower_touch_day)
    upper_wins_mask = (
        upper_hit & (~lower_hit | (upper_touch_day < lower_touch_day)) & ~collision_mask
    )
    lower_wins_mask = (
        lower_hit & (~upper_hit | (lower_touch_day < upper_touch_day)) & ~collision_mask
    )
    neither_hit_mask = ~upper_hit & ~lower_hit & full_window_mask

    returns = np.full(n, np.nan)

    if use_exact_barrier_prices:
        # Realistic execution: if barrier is reached, order executes at the barrier level
        returns[collision_mask] = (lower_barrier[collision_mask] - close[collision_mask]) / close[collision_mask]
        returns[upper_wins_mask] = (upper_barrier[upper_wins_mask] - close[upper_wins_mask]) / close[upper_wins_mask]
        returns[lower_wins_mask] = (lower_barrier[lower_wins_mask] - close[lower_wins_mask]) / close[lower_wins_mask]
    else:
        def _price_on_touch_day(price_array, touch_day):
            result = np.full(n, np.nan)
            valid_rows = ~np.isnan(touch_day)
            idx = np.arange(n)[valid_rows]
            offsets = touch_day[valid_rows].astype(int)
            result[valid_rows] = price_array[idx + offsets]
            return result

        high_on_upper_touch = _price_on_touch_day(high, upper_touch_day)
        low_on_lower_touch = _price_on_touch_day(low, lower_touch_day)

        returns[collision_mask] = (
            low_on_lower_touch[collision_mask] - close[collision_mask]
        ) / close[collision_mask]

        returns[upper_wins_mask] = (
            high_on_upper_touch[upper_wins_mask] - close[upper_wins_mask]
        ) / close[upper_wins_mask]

        returns[lower_wins_mask] = (
            low_on_lower_touch[lower_wins_mask] - close[lower_wins_mask]
        ) / close[lower_wins_mask]

    vertical_idx = np.arange(n)
    vertical_valid = neither_hit_mask & (vertical_idx + max_days < n)
    returns[vertical_valid] = (
        close[vertical_idx[vertical_valid] + max_days] - close[vertical_valid]
    ) / close[vertical_valid]  # type: ignore

    invalid_vol_mask = np.isnan(vol) | (vol <= 0)  # type: ignore
    returns[invalid_vol_mask] = np.nan

    out = df.copy()
    out["Target"] = returns
    return out


def _first_touch_day(condition_matrix: np.ndarray) -> np.ndarray:
    """
    condition_matrix: shape (n_rows, max_days), boolean.
    condition_matrix[i, j] = True if the barrier was touched on day (j+1)
    looking forward from row i.

    Returns: array of shape (n_rows,) with the 1-indexed day of first touch,
    or np.nan if never touched within the window.
    """
    touched_at_all = condition_matrix.any(axis=1)
    # argmax finds the position of the first True (True=1 beats False=0);
    # if a row is all False, argmax returns 0, which is meaningless --
    # that's exactly why we mask it with touched_at_all right after.
    first_touch_idx = condition_matrix.argmax(axis=1)
    first_touch_day = first_touch_idx + 1  # convert to 1-indexed day offset

    result = np.where(touched_at_all, first_touch_day, np.nan)
    return result


def compute_touch_days(
    high: np.ndarray,
    low: np.ndarray,
    upper_barrier: np.ndarray,
    lower_barrier: np.ndarray,
    max_days: int,
):
    n = len(high)

    # Build the (n_rows, max_days) shifted-comparison matrices.
    # Column j (0-indexed) = "touched on day j+1 from now".
    upper_matrix = np.full((n, max_days), False)
    lower_matrix = np.full((n, max_days), False)

    for j in range(1, max_days + 1):
        shifted_high = np.roll(high, -j)
        shifted_low = np.roll(low, -j)

        # rows near the end don't have j days of real future data --
        # np.roll wraps around, which would be wrong, so mask those out
        valid = np.arange(n) < (n - j)

        upper_matrix[:, j - 1] = valid & (shifted_high >= upper_barrier)
        lower_matrix[:, j - 1] = valid & (shifted_low <= lower_barrier)

    upper_touch_day = _first_touch_day(upper_matrix)
    lower_touch_day = _first_touch_day(lower_matrix)

    return upper_touch_day, lower_touch_day


def symbolwiseLabeling(
    df: pd.DataFrame, symbol_col: str = "symbol", date_col: str = "Datetime"
) -> pd.DataFrame:
    labled_frames = []

    for _, group in df.groupby(symbol_col, sort=False):
        symbol_df = group.sort_values(date_col).reset_index(drop=True)
        target_df = apply_triple_barrier_labels(symbol_df)
        labled_frames.append(target_df)

    result = pd.concat(labled_frames, axis=0, ignore_index=False)

    return result
