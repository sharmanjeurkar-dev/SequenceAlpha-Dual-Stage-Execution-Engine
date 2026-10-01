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

