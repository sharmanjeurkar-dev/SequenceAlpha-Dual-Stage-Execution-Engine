"""
Custom Backtrader PandasData feed supporting TFT alpha score lines.
"""

import backtrader as bt


class TFTData(bt.feeds.PandasData):
    """
    Extends Backtrader PandasData to include TFT predicted return scores.
    """

    lines = ("score", "p10", "p90")

    params = (
        ("datetime", None),  # Use DatetimeIndex
        ("open", "Open"),
        ("high", "High"),
        ("low", "Low"),
        ("close", "Close"),
        ("volume", "Volume"),
        ("openinterest", -1),
        ("score", "p50_returns_predicted"),
        ("p10", "p10"),
        ("p90", "p90"),
    )


class NiftyIndexData(bt.feeds.PandasData):
    """
    Extends Backtrader PandasData to include Nifty 50 macro trend & volatility lines.
    """

    lines = ("sma_50", "sma_20", "ret_5d")

    params = (
        ("datetime", None),
        ("open", "Open"),
        ("high", "High"),
        ("low", "Low"),
        ("close", "Close"),
        ("volume", "Volume"),
        ("openinterest", -1),
        ("sma_50", "SMA_50"),
        ("sma_20", "SMA_20"),
        ("ret_5d", "ret_5d"),
    )

