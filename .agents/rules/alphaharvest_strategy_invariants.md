---
description: Production parameters, thresholds, risk guardrails, and execution invariants for AlphaHarvest-Trailing.
globs: ["utility/backtest/**/*.py", "Executables/**/*.py"]
---

# AlphaHarvest-Trailing Production Specifications

## 1. Portfolio Architecture & Cadence
- **Universe**: Cross-sectional candidate universe ranked daily by Temporal Fusion Transformer (TFT) alpha score.
- **Tranches & Slots**: Exactly 15 active slots partitioned into 5 overlapping rolling daily cohorts of 3 slots each.
- **Holding Horizon**: 5 trading days ($H=5$).
- **Daily Rebalancing**: Every trading day, expiring positions (and any mid-week cuts) are evaluated, and the top-3 fresh model signals enter.

## 2. Thresholds & Level Controls
- **Target 1 ($T_1$) Profit Booking**:
  - Threshold: $+6.0\%$ peak unrealized gain from entry.
  - Partial Exit Ratio: Exactly $50\%$ of held shares booked on the bar $T_1$ is reached.
- **Break-Even Stop Floor**:
  - Buffer: $+1.0\%$ net above entry price (guarantees transaction costs are covered).
  - Activation: Ratchets stop immediately to $\max(\text{stop}, \text{entry} \times 1.01)$ upon Target 1 hit.
- **Dynamic Trailing Stop (Remaining 50%)**:
  - Active on the remaining 50% shares after Target 1 is booked.
  - Distance formula: $\text{trail\_dist} = \max(5.0\%, 1.8 \times \sigma_{20})$, where $\sigma_{20}$ is the 20-day historical daily return volatility.
  - Dynamic Stop Level: $\text{stop\_price} = \max(\text{stop\_price}, \text{peak\_price} \times (1.0 - \text{trail\_dist}), \text{entry} \times 1.01)$.
- **Mid-Week Emergency Stop Loss**:
  - Threshold: $-4.5\%$ drop below entry price.
  - Action: Immediate liquidation of 100% position.
- **Quarantine Period**:
  - Any stock cut via emergency stop loss or liquidated at Day 5 as a loser is quarantined for 5 trading bars. Quarantined assets are strictly excluded from top-pick entry.
- **Next-Day Slot Refill**:
  - Any slot vacated mid-week due to stop cuts is scheduled for refill on the immediate next trading bar ($3 + \text{cut yesterday}$).

## 3. Capital Deployment & Sizing Invariants
- **Uncapped Capital Recycling**:
  - Cash liberated from 50% target bookings flows immediately into liquid cash.
  - No arbitrary single-stock caps (e.g. no 8% cap). Capital is dynamically deployed into incoming cohort picks according to available cash.
- **Liquid Cash Sizing Invariant**:
  - Order sizes must strictly be derived from actual spendable liquid cash + verified incoming sale proceeds:
    $$\text{spendable\_cash} = \max(0.0, \text{cash} + \text{expected\_sales} - \text{equity} \times \text{buffer}) \times 0.995$$
  - Order sizing: $\text{shares} = \text{int}(\text{stock\_cash} / (\text{price} \times 1.003))$.
  - Never use theoretical equity percentages without liquid cash verification (prevents Backtrader `order.Margin` rejections).
- **Dynamic Weighting (Pillar 1)**:
  - Entering cohorts are weighted by inverse volatility: $w_i \propto \frac{1}{\sigma_i}$.

## 4. Execution & Broker Model
- **Execution Timing**: Cheat-On-Close (`set_coc(True)`) for immediate liquidation settlement into cash.
- **Cost Model**: Full NSE Delivery statutory charges (STT 0.1%, Brokerage ₹20 cap, GST 18%, Stamp Duty 0.015%, Exchange Turnover 0.00345%) + 5 bps execution slippage.
