import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report

from Data.feature_engineering import (
    build_training_set,
    walk_forward_out_of_sample_dataframe_slices,
)
from Data.historical_data.historical_data_scraper import (
    save_benchmark_data,
    save_histortrical_data,
)

fold_accuracies = []
fold_ics = []

RESOLUTION = "1D"
DAYS = 365
TOTAL_CHUNKS = 5
END_DATE = TODAY = datetime.now()

import os
from datetime import timedelta
from Data.feature_engineering import HISTORICAL_DATA_PATH

all_items = os.listdir(HISTORICAL_DATA_PATH) if os.path.exists(HISTORICAL_DATA_PATH) else []
if all_items:
    first_item_path = os.path.join(HISTORICAL_DATA_PATH, all_items[0])
    if os.path.isfile(first_item_path):
        raw_time = os.path.getctime(first_item_path)
        file_creation_date = datetime.fromtimestamp(raw_time).date()
        if (TODAY.date() - file_creation_date) > timedelta(30):
            _ = save_histortrical_data(
                resolution=RESOLUTION, DAYS=DAYS, total_chunks=TOTAL_CHUNKS, end_date=END_DATE
            )
            _ = save_benchmark_data(
                resolution=RESOLUTION, DAYS=DAYS, total_chunks=TOTAL_CHUNKS, end_date=END_DATE
            )
else:
    _ = save_histortrical_data(
        resolution=RESOLUTION, DAYS=DAYS, total_chunks=TOTAL_CHUNKS, end_date=END_DATE
    )
    _ = save_benchmark_data(
        resolution=RESOLUTION, DAYS=DAYS, total_chunks=TOTAL_CHUNKS, end_date=END_DATE
    )
# accessing the benchmark_data file
benchmark_df = pd.read_parquet("Data/historical_data/data/NSE_NIFTY50-INDEX.parquet")

universal_df, failure_df = build_training_set(
    snapshot_date=datetime.strftime(TODAY, "%Y-%m-%d")
)

feature_columns = [
    "Intraday_Spread",
    "ATR-Ratio",
    "Intraday_Spread_Zscore",
    "RSI-close-score",
    "relative_strength_60d",
    "relative_strength_120d",
    "Vol_Percentile_Rank",
    "Beta_60D",
    "Pct_52W_High",
    "Returns_5D",
    "Intraday_Return",
]

universal_df = universal_df.dropna(subset=feature_columns + ["Target"]).copy()
universal_df["Target_binary"] = (universal_df["Target"] > 0).astype(int)

df_list = walk_forward_out_of_sample_dataframe_slices(
    df=universal_df, jump=3, max_days=10
)

model = LogisticRegression(max_iter=1000)

predictions = []
y_tests = []
fold_cs_ics = []

for fold_num, (train_df, test_df) in enumerate(df_list):
    eval_start_date = getattr(test_df, "attrs", {}).get("eval_start_date", None)
    if eval_start_date is not None:
        eval_test_df = test_df[test_df.index >= eval_start_date].copy()
    else:
        eval_test_df = test_df.copy()

    train_clean = train_df.dropna(subset=feature_columns + ["Target_binary"])
    test_clean = eval_test_df.dropna(subset=feature_columns + ["Target_binary", "Target"])

    if len(train_clean) < 50 or len(test_clean) < 10:
        continue

    X_train = train_clean[feature_columns]
    y_train = train_clean["Target_binary"]
    X_test = test_clean[feature_columns]
    y_test = test_clean["Target_binary"]

    model = LogisticRegression(max_iter=1000)
    model.fit(X_train, y_train)

    predicted_proba = model.predict_proba(X_test)[:, 1]  # probability of class 1
    predicted_class = model.predict(X_test)

    acc = accuracy_score(y_test, predicted_class)
    fold_accuracies.append(acc)

    # Pooled IC
    ic, p_value = spearmanr(predicted_proba, eval_test_df["Target"])
    fold_ics.append(ic)

    # Daily Cross-Sectional IC
    eval_test_df_copy = eval_test_df.copy()
    eval_test_df_copy["pred_score"] = predicted_proba
    daily_cs = []
    for dt, grp in eval_test_df_copy.groupby("Datetime"):
        if len(grp) >= 10 and grp["pred_score"].nunique() > 1 and grp["Target"].nunique() > 1:
            r, _ = spearmanr(grp["pred_score"], grp["Target"])
            if not np.isnan(r):
                daily_cs.append(r)
    mean_cs = np.mean(daily_cs) if daily_cs else np.nan
    fold_cs_ics.append(mean_cs)

    print(f"Fold {fold_num}: accuracy={acc:.3f}, Pooled IC={ic:.4f}, Daily CS-IC={mean_cs:.4f}")

print(
    f"\nMean accuracy across folds: {np.nanmean(fold_accuracies):.3f}"
)
print(f"Mean Pooled IC across folds: {np.nanmean(fold_ics):.4f}")
print(f"Mean Daily CS-IC across folds: {np.nanmean(fold_cs_ics):.4f}")

"""
Result of baseline:
ll sets before the end date covered
/Users/sharmanjeurkar/Projects/SequenceAlpha/venv/lib/python3.11/site-packages/sklearn/linear_model/_logistic.py:599: ConvergenceWarning: lbfgs failed to converge after 1000 iteration(s) (status=1):
STOP: TOTAL NO. OF ITERATIONS REACHED LIMIT

Increase the number of iterations to improve the convergence (max_iter=1000).
You might also want to scale the data as shown in:
    https://scikit-learn.org/stable/modules/preprocessing.html
Please also refer to the documentation for alternative solver options:
    https://scikit-learn.org/stable/modules/linear_model.html#logistic-regression
  n_iter_i = _check_optimize_result(
Fold 0: accuracy=0.478, IC=0.0255 (p=0.000)
/Users/sharmanjeurkar/Projects/SequenceAlpha/venv/lib/python3.11/site-packages/sklearn/linear_model/_logistic.py:599: ConvergenceWarning: lbfgs failed to converge after 1000 iteration(s) (status=1):
STOP: TOTAL NO. OF ITERATIONS REACHED LIMIT

Increase the number of iterations to improve the convergence (max_iter=1000).
You might also want to scale the data as shown in:
    https://scikit-learn.org/stable/modules/preprocessing.html
Please also refer to the documentation for alternative solver options:
    https://scikit-learn.org/stable/modules/linear_model.html#logistic-regression
  n_iter_i = _check_optimize_result(
Fold 1: accuracy=0.634, IC=-0.0037 (p=0.482)
Fold 2: accuracy=0.448, IC=-0.0319 (p=0.000)
Fold 3: accuracy=0.524, IC=0.0037 (p=0.474)
Fold 4: accuracy=0.500, IC=-0.0101 (p=0.052)
Fold 5: accuracy=0.580, IC=-0.0168 (p=0.001)
Fold 6: accuracy=0.525, IC=0.0197 (p=0.000)
Fold 7: accuracy=0.577, IC=-0.0204 (p=0.000)
Fold 8: accuracy=0.618, IC=-0.0469 (p=0.000)
Fold 9: accuracy=0.650, IC=-0.1380 (p=0.000)
Fold 10: accuracy=0.531, IC=-0.0251 (p=0.000)
Fold 11: accuracy=0.602, IC=-0.0730 (p=0.000)
Fold 12: accuracy=0.623, IC=-0.0359 (p=0.000)
Fold 13: accuracy=0.679, IC=0.0003 (p=0.947)
Fold 14: accuracy=0.506, IC=-0.0727 (p=0.000)
Fold 15: accuracy=0.683, IC=nan (p=nan)

Mean accuracy across folds: 0.572
Mean IC across folds: nan
IC std across folds: 0.0419
"""
