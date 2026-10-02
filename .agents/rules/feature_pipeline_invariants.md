---
description: Invariants for quantitative feature engineering, dataset constructors, and model inputs in SequenceAlpha.
globs: ["Data/**/*.py", "Executables/**/*.py"]
---

# Feature Pipeline Invariants

1. **Single Source of Truth for Model Features**:
   - Model constructors (`TimeSeriesDataSet`, linear baselines, diagnostic scripts) must never hardcode a duplicated list of feature names.
   - Always reference the canonical `features` list directly (e.g., `time_varying_unknown_reals=features`).

2. **Empirical Gatekeeping Before Adoption**:
   - Never add candidate features based on intuition alone.
   - Every candidate feature must be empirically benchmarked using daily cross-sectional Spearman rank correlation (Daily CS-IC), Information Ratio (CS-IR), and win rate over multi-year out-of-sample data.
   - Discard features with near-zero IC ($|IC| < 0.005$) or excessive collinearity ($\rho > 0.8$) with existing factors.

3. **Strict Temporal Directionality & Leakage Prevention**:
   - Features (`Returns_5D`, `Intraday_Return`, `Pct_52W_High`) must strictly look backwards from time $T$ into the past ($T - k \dots T$).
   - Targets (`Target`) must strictly represent forward price action ($T+1$ or $T+1 \dots T+H$).
   - Slicing functions must preserve an encoder history buffer (`encoder_buffer_trading_days >= MAX_ENCODER_LENGTH`) when slicing out-of-sample test periods.
