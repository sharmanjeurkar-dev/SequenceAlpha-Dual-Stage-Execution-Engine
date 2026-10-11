import numpy as np
import pandas as pd


def calculate_position_sizes(
    stock_list: list,
    price_history: pd.DataFrame,
    model_signals: dict,
    total_budget: float,
) -> dict:
    """
    Computes dynamic risk-adjusted position sizes based on:
    1. Inverse Volatility (equalizes risk contribution across stocks)
    2. Model Conviction (boosts high p50 return / narrow uncertainty spread)
    3. Pairwise Correlation Penalty (downweights stocks with high basket correlation)
    """
    if not stock_list:
        return {}

    # Calculate returns for percentage volatility & correlation
    returns = price_history[stock_list].pct_change().dropna()
    R = (
        returns.corr()
        if len(returns) > 1
        else pd.DataFrame(
            np.eye(len(stock_list)), index=stock_list, columns=stock_list
        )
    )
    N = len(stock_list)

    final_sizing = {}
    weights_list = []

    for stock in stock_list:
        # 1. Volatility weightage (inverse percentage volatility)
        vol = (
            returns[stock].std()
            if (stock in returns.columns and len(returns) > 1)
            else 0.02
        )
        if np.isnan(vol) or vol <= 1e-4:
            vol = 0.02  # fallback ~2% daily vol
        w_vol = 1.0 / vol

        # 2. Conviction weightage (from TFT predicted quantiles)
        w_raw = w_vol
        if model_signals is not None and stock in model_signals:
            sig = model_signals[stock]
            p50 = sig.get("p50", 0.0)
            spread = sig.get("p90", 0.0) - sig.get("p10", 0.0)
            conviction = max(p50, 0.0) / max(spread, 0.02)
            w_raw = w_vol * (1.0 + conviction)

        # 3. Correlation / Diversification penalty
        if N > 1 and stock in R.columns:
            avg_corr = float((R[stock].sum() - 1.0) / (N - 1))
            diversification_multiplier = max(1.0 - avg_corr * 0.5, 0.5)
        else:
            diversification_multiplier = 1.0

        w_final = w_raw * diversification_multiplier
        weights_list.append(w_final)

    total_weights = sum(weights_list)
    if total_weights <= 0 or np.isnan(total_weights):
        equal_w = total_budget / len(stock_list)
        return {s: equal_w for s in stock_list}

    for i in range(len(stock_list)):
        w = total_budget * (weights_list[i] / total_weights)
        final_sizing[stock_list[i]] = w

    return final_sizing
