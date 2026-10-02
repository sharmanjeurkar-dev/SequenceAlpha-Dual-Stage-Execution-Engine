import sys
import os
import numpy as np
import pandas as pd
import torch
import lightning.pytorch as pl
from datetime import datetime

# Set path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from Data.feature_engineering import (
    build_training_set,
    walk_forward_out_of_sample_dataframe_slices,
)
from Executables.model_execute import (
    build_dataset,
    model_and_trainer_setup,
    compute_fold_metrics,
    decile_spread,
    features,
    MAX_ENCODER_LENGTH,
    MAX_PRED_LENGTH,
)
from Executables.feature_diagnostic import global_correlation, cross_sectional_ic

def test_pipeline():
    print("=" * 60)
    print("STEP 1: Testing Data Loading & Feature Engineering Pipeline")
    print("=" * 60)

    # Use the snapshot date available
    snapshot_date = "2026-08-11"
    df, failure_df = build_training_set(
        snapshot_date=snapshot_date,
        target_type="forward_return",
        forward_horizon=5,
        standardize_features=True,
    )
    print(f"Loaded DataFrame rows: {len(df):,}")
    print(f"Unique symbols: {df['symbol'].nunique()}")
    print(f"Unique dates: {df['Datetime'].nunique()}")
    print(f"Columns: {df.columns.tolist()[:15]}...")

    # Assertions
    assert "timeidx" in df.columns, "timeidx column missing!"
    assert "Target" in df.columns, "Target column missing!"
    assert "Datetime" in df.columns, "Datetime column missing!"
    assert df["timeidx"].isna().sum() == 0, "Found NaNs in timeidx!"
    assert not df["Target"].isna().all(), "All Target values are NaN!"

    # Check that timeidx is synchronized across symbols
    date_to_timeidx = df.groupby("Datetime")["timeidx"].nunique()
    assert (date_to_timeidx == 1).all(), "timeidx is NOT unique per calendar date!"
    print("✓ Calendar synchronization check PASSED: All stocks on a given date share the exact same timeidx!")

    # Check features
    df[features] = df[features].astype(np.float32)
    df = df.dropna(subset=features + ["Target"])
    print(f"Clean rows after dropping feature/target NaNs: {len(df):,}")

    print("\n" + "=" * 60)
    print("STEP 2: Testing Feature Diagnostic Functions")
    print("=" * 60)
    glob_df = global_correlation(df, features)
    print("Global Correlation summary:\n", glob_df[["feature", "spearman_r", "spearman_p"]].head(4))
    cs_df = cross_sectional_ic(df, features)
    print("Cross-Sectional IC summary:\n", cs_df[["feature", "mean_ic", "std_ic", "pct_positive_days"]].head(4))
    assert len(cs_df) > 0, "Cross-sectional IC failed to compute!"
    print("✓ Feature diagnostic check PASSED!")

    print("\n" + "=" * 60)
    print("STEP 3: Testing Walk-Forward Out-Of-Sample Slicing")
    print("=" * 60)
    slices = walk_forward_out_of_sample_dataframe_slices(df=df, jump=3, max_days=10)
    print(f"Generated {len(slices)} walk-forward folds.")
    assert len(slices) > 0, "No walk-forward folds generated!"

    train_df, test_df = slices[0]
    eval_start_date = getattr(test_df, "attrs", {}).get("eval_start_date", None)
    print(f"Fold 0 Train Range: {train_df.index.min()} to {train_df.index.max()} (rows: {len(train_df):,})")
    print(f"Fold 0 Test Range:  {test_df.index.min()} to {test_df.index.max()} (rows: {len(test_df):,})")
    print(f"Fold 0 Eval Start:  {eval_start_date}")

    assert eval_start_date is not None, "eval_start_date attribute missing on test_df!"
    assert test_df.index.min() < eval_start_date, "Encoder buffer history is NOT prepended to test_df!"
    print("✓ Walk-forward buffer preservation check PASSED: test_df includes encoder history before eval_start_date!")

    print("\n" + "=" * 60)
    print("STEP 4: Testing PyTorch Forecasting TimeSeriesDataSet Construction")
    print("=" * 60)
    # Subset to 25 symbols for fast verification
    sample_symbols = train_df["symbol"].unique()[:25]
    train_sample = train_df[train_df["symbol"].isin(sample_symbols)].copy()
    test_sample = test_df[test_df["symbol"].isin(sample_symbols)].copy()
    test_sample.attrs["eval_start_date"] = eval_start_date

    train_sample = train_sample.sort_values(by=["symbol", "timeidx"]).reset_index(drop=True)
    test_sample = test_sample.sort_values(by=["symbol", "timeidx"]).reset_index(drop=True)

    training, validation, train_loader, val_loader = build_dataset(train_sample, test_sample)
    print("Training dataset length:", len(training))
    print("Validation dataset length:", len(validation))
    assert len(training) > 0, "Training dataset is empty!"
    assert len(validation) > 0, "Validation dataset is empty!"

    # Check batch shapes from DataLoader
    batch_x, batch_y = next(iter(train_loader))
    print("DataLoader batch_x encoder_cont shape:", batch_x["encoder_cont"].shape)
    print("DataLoader batch_y target shape:", batch_y[0].shape)
    print("✓ PyTorch Forecasting dataset & dataloader check PASSED!")

    print("\n" + "=" * 60)
    print("STEP 5: Testing TFT Model Instantiation, Forward Pass & Fast 1-Epoch Training")
    print("=" * 60)
    model, _ = model_and_trainer_setup(training)
    
    # Configure fast test trainer for 1 epoch on cpu
    test_trainer = pl.Trainer(
        max_epochs=1,
        accelerator="cpu",
        logger=False,
        enable_checkpointing=False,
        enable_progress_bar=False,
    )
    test_trainer.fit(model, train_dataloaders=train_loader, val_dataloaders=val_loader)
    print("✓ Model training for 1 epoch finished without errors!")

    print("\n" + "=" * 60)
    print("STEP 6: Testing Prediction & Evaluation Metrics")
    print("=" * 60)
    metrics = compute_fold_metrics(
        model=model,
        val_dl=val_loader,
        validation_dataset=validation,
        test_df=test_sample,
        fold_id=0,
        eval_start_date=eval_start_date,
    )
    print("Compute fold metrics output:")
    print("  Daily CS-IC:          ", metrics.get("daily_cs_ic"))
    print("  Daily CS-Std:         ", metrics.get("daily_cs_std"))
    print("  Daily CS-IR:          ", metrics.get("daily_cs_ir"))
    print("  Pct Positive Days:    ", metrics.get("pct_positive_ic_days"))
    print("  Pooled IC:            ", metrics.get("pooled_ic"))
    print("  Quantile Coverage:    ", metrics.get("coverage"))
    print("  Number of Eval Dates: ", metrics.get("n_eval_dates"))

    assert not np.isnan(metrics.get("pooled_ic")), "Pooled IC returned NaN!"
    assert metrics.get("n_eval_dates", 0) > 0, "Zero evaluation dates found!"
    print("✓ Fold metrics calculation check PASSED!")

    print("\n" + "=" * 60)
    print("STEP 7: Testing Decile Spread & Backtest Calculations")
    print("=" * 60)
    backtest_df, mean_spread, std_spread, win_rate, sharpe = decile_spread(
        model=model,
        validation_dataloader=val_loader,
        test_df=test_sample,
        fold_id=0,
        eval_start_date=eval_start_date,
        tpct=0.2,
        min_stocks_per_decile=2,
    )
    print(f"Backtest days generated: {len(backtest_df)}")
    print(f"Mean Spread:             {mean_spread:+.5f}")
    print(f"Std Spread:              {std_spread:.5f}")
    print(f"Win Rate:                {win_rate*100:.1f}%")
    print(f"Sharpe Ratio:            {sharpe:.2f}")

    if len(backtest_df) > 0:
        assert backtest_df["spread"].isna().sum() == 0, "Found NaN spreads in backtest DataFrame!"
        print("✓ Decile spread check PASSED: No NaN spread records!")

    print("\n" + "=" * 60)
    print("🎉 ALL 7 PIPELINE INTEGRITY & RUNTIME CHECKS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    test_pipeline()
