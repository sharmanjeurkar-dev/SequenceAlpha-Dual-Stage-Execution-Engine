import os
import pickle
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import lightning.pytorch as pl
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
from lightning.pytorch.callbacks import EarlyStopping
from pytorch_forecasting import TemporalFusionTransformer, TimeSeriesDataSet
from pytorch_forecasting.data import TorchNormalizer
from pytorch_forecasting.metrics import QuantileLoss
from scipy.stats import spearmanr
from torch.utils.data import WeightedRandomSampler

from Data.feature_engineering import (
    HISTORICAL_DATA_PATH,
    build_training_set,
    walk_forward_out_of_sample_dataframe_slices,
)
from Data.historical_data.historical_data_scraper import (
    save_benchmark_data,
    save_histortrical_data,
)

TARGET = "Target"
GROUP = "symbol"
TIMEIDX = "timeidx"
DATE_COL = "date"
MAX_ENCODER_LENGTH = 20  # Shortened from 32 to focus on active signal horizon
MAX_PRED_LENGTH = 1
EMBARGO_HOURS = 2
RESOLUTION = "1D"
DAYS = 365
TOTAL_CHUNKS = 5
END_DATE = TODAY = datetime.now()

features = [
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


def build_dataset(train_df, test_df):
    training = TimeSeriesDataSet(
        train_df,
        time_idx="timeidx",
        target="Target",
        group_ids=["symbol"],
        max_encoder_length=MAX_ENCODER_LENGTH,
        max_prediction_length=MAX_PRED_LENGTH,
        time_varying_known_reals=[],
        time_varying_unknown_reals=[
            "Intraday_Spread",
            "ATR-Ratio",
            "Intraday_Spread_Zscore",
            "RSI-close-score",
            "relative_strength_60d",
            "relative_strength_120d",
            "Vol_Percentile_Rank",
            "Beta_60D",
        ],
        target_normalizer=TorchNormalizer(method="identity"),
        allow_missing_timesteps=True,
        add_relative_time_idx=True,
        add_target_scales=False,
    )

    validation = training.from_dataset(
        training,
        test_df,
        stop_randomization=True,
    )

    train_dataloader = training.to_dataloader(
        train=True, batch_size=256, num_workers=0, shuffle=True
    )
    validation_dataloader = validation.to_dataloader(
        train=False, batch_size=256, num_workers=0, shuffle=False
    )
    return training, validation, train_dataloader, validation_dataloader


def model_and_trainer_setup(training: TimeSeriesDataSet):
    model = TemporalFusionTransformer.from_dataset(
        training,
        hidden_size=32,  # Down from 128 (reduces parameter bloat)
        attention_head_size=2,  # Down from 4
        dropout=0.25,  # Up from 0.1 (stronger regularization)
        hidden_continuous_size=8,  # Down from 16
        loss=QuantileLoss(quantiles=[0.1, 0.5, 0.9]),
        learning_rate=7e-4,  # Slightly higher initial rate
        optimizer="adam",
        reduce_on_plateau_patience=2,  # Faster decay upon plateau
    )

    early_stop = EarlyStopping(
        monitor="val_loss",
        patience=6,  # Down from 15 (stops before noise memorization)
        mode="min",
    )

    trainer = pl.Trainer(
        max_epochs=35,  # Down from 100
        accelerator="mps"
        if torch.backends.mps.is_available()
        else "cuda"
        if torch.cuda.is_available()
        else "cpu",
        gradient_clip_val=0.1,
        callbacks=[early_stop],
        logger=False,
        enable_checkpointing=False,
        enable_progress_bar=True,
    )
    return model, trainer


def compute_fold_metrics(
    model, val_dl, validation_dataset, test_df, fold_id, eval_start_date=None
):
    raw_preds = model.predict(val_dl, mode="quantiles", return_index=True)
    preds = raw_preds.output
    index_df = raw_preds.index
    quantiles = model.loss.quantiles
    p10_idx = quantiles.index(min(quantiles, key=lambda q: abs(q - 0.1)))
    p50_idx = quantiles.index(min(quantiles, key=lambda q: abs(q - 0.5)))
    p90_idx = quantiles.index(min(quantiles, key=lambda q: abs(q - 0.9)))

    preds = preds.squeeze(1).numpy()
    merged = index_df.copy()
    merged["pred_p10"] = preds[:, p10_idx]
    merged["pred_p50"] = preds[:, p50_idx]
    merged["pred_p90"] = preds[:, p90_idx]

    test_df_reset = (
        test_df.reset_index(drop=True)
        if "Datetime" in test_df.columns
        else test_df.reset_index()
    )
    datelookup = test_df_reset.set_index(["symbol", "timeidx"])["Datetime"]
    merged = merged.join(datelookup, on=["symbol", "timeidx"])
    merged = merged.rename(columns={"Datetime": "date"})

    actual_lookup = test_df_reset.set_index([GROUP, TIMEIDX])[TARGET]
    merged["actual"] = merged.apply(
        lambda r: actual_lookup.get((r[GROUP], r[TIMEIDX] + MAX_PRED_LENGTH), np.nan),
        axis=1,
    )
    merged = merged.dropna(subset=["actual"])

    if eval_start_date is not None and "date" in merged.columns:
        merged = merged[merged["date"] >= eval_start_date]

    # True Daily Cross-Sectional IC
    daily_cs_ics = []
    for dt, grp in merged.groupby("date"):
        if (
            len(grp) >= 10
            and grp["pred_p50"].nunique() > 1
            and grp["actual"].nunique() > 1
        ):
            ic_val, _ = spearmanr(grp["pred_p50"], grp["actual"])
            if not np.isnan(ic_val):
                daily_cs_ics.append(ic_val)

    mean_cs_ic = float(np.mean(daily_cs_ics)) if daily_cs_ics else np.nan
    std_cs_ic = float(np.std(daily_cs_ics)) if daily_cs_ics else np.nan
    cs_ir = (mean_cs_ic / std_cs_ic) if (std_cs_ic and std_cs_ic > 0) else np.nan
    pct_pos_days = (
        float((np.array(daily_cs_ics) > 0).mean()) if daily_cs_ics else np.nan
    )

    pooled_ic, pval = spearmanr(merged["pred_p50"], merged["actual"])
    coverage = (
        (merged["actual"] >= merged["pred_p10"])
        & (merged["actual"] <= merged["pred_p90"])
    ).mean()

    per_symbol_ic = {}
    for sym, g in merged.groupby(GROUP):
        if len(g) > 5 and g["pred_p50"].nunique() > 1 and g["actual"].nunique() > 1:
            sym_ic, _ = spearmanr(g["pred_p50"], g["actual"])
            if not np.isnan(sym_ic):
                per_symbol_ic[sym] = sym_ic

    return {
        "fold": fold_id,
        "daily_cs_ic": mean_cs_ic,
        "daily_cs_std": std_cs_ic,
        "daily_cs_ir": cs_ir,
        "pct_positive_ic_days": pct_pos_days,
        "pooled_ic": pooled_ic,
        "pvalue": pval,
        "coverage": coverage,
        "n_test_rows": len(merged),
        "n_eval_dates": len(daily_cs_ics),
        **{f"ic_{k}": v for k, v in per_symbol_ic.items()},
    }


def decile_spread(
    model,
    validation_dataloader,
    test_df,
    fold_id,
    eval_start_date=None,
    tpct=0.1,
    min_stocks_per_decile: int = 5,
):
    raw_preds = model.predict(
        validation_dataloader, mode="quantiles", return_index=True
    )
    preds = raw_preds.output.squeeze().numpy()
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

    actual = test_df_reset.set_index(["symbol", "timeidx"])[TARGET]
    merged["actual_returns"] = merged.apply(
        lambda r: actual.get((r[GROUP], r[TIMEIDX] + MAX_PRED_LENGTH), np.nan),
        axis=1,
    )
    merged = merged.dropna(subset=["actual_returns"])
    merged["fold-id"] = fold_id

    if eval_start_date is not None and "date" in merged.columns:
        merged = merged[merged["date"] >= eval_start_date]

    decile_returns_comparision = []
    for date, group in merged.groupby("date"):
        final = group.sort_values(by="p50_returns_predicted")
        number_of_stocks = len(final)
        number_of_stocks_div = int(number_of_stocks * tpct)
        if number_of_stocks_div < min_stocks_per_decile:
            continue
        decile_down = final.iloc[:number_of_stocks_div]
        decile_top = final.iloc[-number_of_stocks_div:]

        avg_returns_actual_top_decile = decile_top["actual_returns"].mean()
        avg_returns_actual_down_decile = decile_down["actual_returns"].mean()

        spread = avg_returns_actual_top_decile - avg_returns_actual_down_decile
        if not np.isnan(spread):
            decile_returns_comparision.append(
                {
                    "date": date,
                    "fold_id": fold_id,
                    "spread": spread,
                    "top_decile_return": avg_returns_actual_top_decile,
                    "bottom_decile_return": avg_returns_actual_down_decile,
                    "n_stocks": number_of_stocks_div,
                }
            )

    daily_backtest_df = pd.DataFrame(decile_returns_comparision)
    if len(daily_backtest_df) > 0:
        mean_spread = float(daily_backtest_df["spread"].mean())
        std_spread = float(daily_backtest_df["spread"].std())
        win_rate = float((daily_backtest_df["spread"] > 0).mean())
        sharpe = (
            float((mean_spread / std_spread * np.sqrt(252)))
            if std_spread > 0
            else np.nan
        )
    else:
        mean_spread, std_spread, win_rate, sharpe = np.nan, np.nan, np.nan, np.nan

    return daily_backtest_df, mean_spread, std_spread, win_rate, sharpe


def plot_model_output(model, validation_dataloader):
    predictions = model.predict(validation_dataloader, return_y=True)
    pred_values = predictions.output.cpu().numpy().flatten()
    actual_values = predictions.y[0].cpu().numpy().flatten()

    plt.figure(figsize=(8, 6))
    plt.scatter(pred_values, actual_values, alpha=0.1, s=5, color="steelblue")
    plt.xlabel("Predicted Return")
    plt.ylabel("Actual Return")
    plt.title("TFT: Predicted vs Actual Return")
    plt.axhline(0, color="gray", linewidth=0.5, linestyle="--")
    plt.axvline(0, color="gray", linewidth=0.5, linestyle="--")
    plt.tight_layout()
    plt.savefig("predicted_vs_actual.png", dpi=150)
    plt.show()

    raw_predictions = model.predict(validation_dataloader, mode="raw", return_x=True)

    interpretation = model.interpret_output(raw_predictions.output, reduction="sum")
    model.plot_interpretation(interpretation)
    plt.tight_layout()
    plt.savefig("tft_interpretation.png", dpi=150)
    plt.show()

    raw_preds = raw_predictions.output.prediction.cpu().numpy()

    p10 = raw_preds[:, 0, 0]
    p50 = raw_preds[:, 0, 1]
    p90 = raw_preds[:, 0, 2]

    within_band = np.mean((actual_values >= p10) & (actual_values <= p90))
    print(f"Quantile coverage (should be ~80%): {within_band * 100:.1f}%")

    plt.figure(figsize=(12, 5))
    sample_idx = np.arange(min(200, len(actual_values)))
    plt.fill_between(
        sample_idx,
        p10[:200],
        p90[:200],
        alpha=0.3,
        color="steelblue",
        label="p10-p90 band",
    )
    plt.plot(
        sample_idx, p50[:200], color="steelblue", linewidth=1, label="p50 prediction"
    )
    plt.plot(
        sample_idx, actual_values[:200], color="coral", linewidth=1, label="actual"
    )
    plt.xlabel("Sample index")
    plt.ylabel("Return")
    plt.title("TFT: Quantile predictions vs actual (first 200 samples)")
    plt.legend()
    plt.tight_layout()
    plt.savefig("quantile_coverage.png", dpi=150)
    plt.show()


def run_walk_forward_pipeline():
    # Scan the univrse, screen the right symbols, download the historical data for timedelta greater than one day
    all_items = os.listdir(HISTORICAL_DATA_PATH)
    if all_items:
        first_item_path = os.path.join(HISTORICAL_DATA_PATH, all_items[0])
        if os.path.isfile(first_item_path):
            print("Historical data files found")
            raw_time = os.path.getctime(first_item_path)
            file_creation_date = datetime.fromtimestamp(raw_time).date()
            target_date = TODAY.date()
            time_difference = target_date - file_creation_date
            print(f"Time difference in creation and today:{time_difference}")
            if time_difference > timedelta(20):
                print("Data stale....\nDownloading fresh data......")
                failed_symbols = save_histortrical_data(
                    resolution=RESOLUTION,
                    DAYS=DAYS,
                    total_chunks=TOTAL_CHUNKS,
                    end_date=END_DATE,
                )
                if failed_symbols is not None:
                    print(len(failed_symbols))
                    for fs in failed_symbols:
                        print(fs, "\t")
                _ = save_benchmark_data(
                    resolution=RESOLUTION,
                    DAYS=DAYS,
                    total_chunks=TOTAL_CHUNKS,
                    end_date=END_DATE,
                )

    df, _ = build_training_set(snapshot_date=datetime.strftime(TODAY, "%Y-%m-%d"))
    float64_cols = df.select_dtypes(include=["float64"]).columns
    df[float64_cols] = df[float64_cols].astype(np.float32)
    df[features] = df[features].astype(np.float32)
    df.dropna(inplace=True)
    df = df.sort_values(by=["symbol", "Datetime"])
    print(f"\t \t Clean dataset rows: {len(df)} \t \t")

    # WalkForward Slicing for training and Out of sample Validation
    df_acc_folds = walk_forward_out_of_sample_dataframe_slices(df=df)
    results = []
    backtest_metrics = []
    spread_metrics = []

    for i, (train_df, test_df) in enumerate(df_acc_folds):
        eval_start_date = getattr(test_df, "attrs", {}).get("eval_start_date", None)
        train_df = train_df.sort_values(by=["symbol", "timeidx"]).reset_index(drop=True)
        test_df = test_df.sort_values(by=["symbol", "timeidx"]).reset_index(drop=True)

        training, validation, train_dataloader, validation_dataloader = build_dataset(
            train_df=train_df, test_df=test_df
        )
        model, trainer = model_and_trainer_setup(training=training)
        trainer.fit(
            model=model,
            train_dataloaders=train_dataloader,
            val_dataloaders=validation_dataloader,
        )
        metrics = compute_fold_metrics(
            model=model,
            val_dl=validation_dataloader,
            validation_dataset=validation,
            test_df=test_df,
            fold_id=i,
            eval_start_date=eval_start_date,
        )
        backtest_df, mean_spread, std_spread, win_rate, sharpe = decile_spread(
            model=model,
            validation_dataloader=validation_dataloader,
            test_df=test_df,
            fold_id=i,
            eval_start_date=eval_start_date,
        )
        if len(backtest_df) > 0:
            spread_metrics.append(backtest_df)
        backtest_metrics.append(
            {
                "Fold_id": i,
                "Mean_spread": mean_spread,
                "Std_spread": std_spread,
                "Win rate %": win_rate,
                "Sharpe Ratio": sharpe,
            }
        )

        results.append(metrics)
        pd.DataFrame(results).to_csv(
            "walk_forward_out_of_sample_results.csv", index=False
        )
        pd.DataFrame(backtest_metrics).to_csv("Backtest_Spread_Test.csv", index=False)
        if spread_metrics:
            pd.concat(spread_metrics, ignore_index=True).to_csv(
                "Decile_Spread_Result.csv", index=False
            )
        trainer.save_checkpoint(
            f"/Users/sharmanjeurkar/Projects/SequenceAlpha/models/saved/model_fold_{i}"
        )
        print("\n\n\n")
        print("*" * 50)
        print(metrics)
        print("*" * 50)
        print("\n\n\n")

    results_df = pd.DataFrame(results)

    print("-" * 50)
    print("\n\n")
    print(results_df)
    print(
        "Mean Daily CS-IC:",
        results_df["daily_cs_ic"].mean(),
        "Std Daily CS-IC:",
        results_df["daily_cs_ic"].std(),
    )
    print(
        "Mean Pooled IC:",
        results_df["pooled_ic"].mean(),
        "Std Pooled IC:",
        results_df["pooled_ic"].std(),
    )
    print("\n\n")
    print("-" * 50)
    trainer.save_checkpoint(
        "/Users/sharmanjeurkar/Projects/SequenceAlpha/models/saved/tft_model.ckpt"
    )

    plot_model_output(model=model, validation_dataloader=validation_dataloader)
    pickle.dump(training, open("training_dataset.pkl", "wb"))
    print("Model and dataset saved successfully")


if __name__ == "__main__":
    run_walk_forward_pipeline()
