"""
Extracts and consolidates out-of-sample prediction signals from the 16 saved
walk-forward TFT models for use in Backtrader event-driven simulation.
"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import numpy as np
import pandas as pd
import torch
from pytorch_forecasting import TemporalFusionTransformer

from Data.feature_engineering import (
    build_training_set,
    walk_forward_out_of_sample_dataframe_slices,
)
from Executables.model_execute import (
    GROUP,
    MAX_PRED_LENGTH,
    TARGET,
    TIMEIDX,
    build_dataset,
    features,
)

OUTPUT_CACHE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "Data", "cache", "tft_oos_predictions.parquet"
)


def generate_oos_predictions(checkpoint_dir="models/saved"):
    today = datetime.now()
    print("Step 1: Building multi-year dataset with H=5 forward target...")
    df, _ = build_training_set(
        snapshot_date=today.strftime("%Y-%m-%d"),
        forward_horizon=5,
        standardize_features=True,
    )

    float64_cols = df.select_dtypes(include=["float64"]).columns
    df[float64_cols] = df[float64_cols].astype(np.float32)
    df[features] = df[features].astype(np.float32)
    df.dropna(inplace=True)
    df = df.sort_values(by=["symbol", "Datetime"])
    print(f"Clean rows: {len(df):,}, Symbols: {df['symbol'].nunique()}, Dates: {df['Datetime'].nunique()}")

    print("Step 2: Slicing walk-forward out-of-sample folds...")
    df_acc_folds = walk_forward_out_of_sample_dataframe_slices(df=df, jump=3, max_days=10)
    print(f"Generated {len(df_acc_folds)} walk-forward folds.")

    all_fold_predictions = []

    for fold_id, (train_df, test_df) in enumerate(df_acc_folds):
        ckpt_path = os.path.join(checkpoint_dir, f"model_fold_{fold_id}")
        if not os.path.exists(ckpt_path):
            print(f"Checkpoint for fold {fold_id} not found at {ckpt_path}. Skipping.")
            continue

        print(f"\n--- Processing Fold {fold_id} ---")
        eval_start_date = getattr(test_df, "attrs", {}).get("eval_start_date", None)
        train_df = train_df.sort_values(by=["symbol", "timeidx"]).reset_index(drop=True)
        test_df = test_df.sort_values(by=["symbol", "timeidx"]).reset_index(drop=True)

        training, validation, train_dl, val_dl = build_dataset(
            train_df=train_df, test_df=test_df
        )

        model = TemporalFusionTransformer.load_from_checkpoint(ckpt_path)
        model.eval()

        # Generate predictions on GPU (Apple Silicon MPS / CUDA) if available
        accel = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
        raw_preds = model.predict(val_dl, mode="quantiles", return_index=True, trainer_kwargs=dict(accelerator=accel))
        preds = raw_preds.output.squeeze().cpu().numpy()
        index_df = raw_preds.index

        merged = index_df.copy()
        merged["p10"] = preds[:, 0]
        merged["p50_returns_predicted"] = preds[:, 1]
        merged["p90"] = preds[:, 2]

        test_df_reset = (
            test_df.reset_index(drop=True)
            if "Datetime" in test_df.columns
            else test_df.reset_index()
        )
        datelookup = test_df_reset.set_index(["symbol", "timeidx"])["Datetime"]
        merged = merged.join(datelookup, on=["symbol", "timeidx"])
        merged = merged.rename(columns={"Datetime": "date"})

        actual_lookup = test_df_reset.set_index([GROUP, TIMEIDX])[TARGET]
        merged["actual_returns"] = merged.apply(
            lambda r: actual_lookup.get((r[GROUP], r[TIMEIDX] + MAX_PRED_LENGTH), np.nan),
            axis=1,
        )
        merged["fold_id"] = fold_id

        # Strictly filter to out-of-sample evaluation period
        if eval_start_date is not None and "date" in merged.columns:
            merged = merged[merged["date"] >= eval_start_date]

        merged = merged.dropna(subset=["date", "p50_returns_predicted"])
        print(f"Fold {fold_id}: {len(merged):,} out-of-sample predictions extracted across {merged['date'].nunique()} dates.")
        all_fold_predictions.append(merged)

    if not all_fold_predictions:
        raise RuntimeError("No predictions were extracted from any fold!")

    full_oos_df = pd.concat(all_fold_predictions, ignore_index=True)
    # Deduplicate in case of date overlap, keeping latest fold
    full_oos_df = full_oos_df.sort_values(by=["date", "symbol", "fold_id"])
    full_oos_df = full_oos_df.drop_duplicates(subset=["date", "symbol"], keep="last")

    os.makedirs(os.path.dirname(OUTPUT_CACHE_PATH), exist_ok=True)
    full_oos_df.to_parquet(OUTPUT_CACHE_PATH, index=False)
    print(f"\n✓ Successfully saved {len(full_oos_df):,} out-of-sample predictions to {OUTPUT_CACHE_PATH}")
    print(f"Date range: {full_oos_df['date'].min()} to {full_oos_df['date'].max()}")
    print(f"Unique symbols covered: {full_oos_df['symbol'].nunique()}")
    return full_oos_df


if __name__ == "__main__":
    generate_oos_predictions()
