import React from 'react';
import type { TftQuantileInference } from '../types/portfolio';

interface TftQuantileMatrixProps {
  candidates: TftQuantileInference[];
}

export const TftQuantileMatrix: React.FC<TftQuantileMatrixProps> = ({ candidates }) => {
  return (
    <div className="bg-[#0a0d13] border border-[#1e2633] p-3 rounded flex flex-col font-mono text-xs shadow-inner space-y-3">
      <div className="flex items-center justify-between border-b border-[#212936] pb-2">
        <div>
          <h2 className="text-sm font-bold text-[#a855f7]">
            TEMPORAL FUSION TRANSFORMER (TFT) INFERENCE MATRIX — FOLD 14 CHAMPION
          </h2>
          <p className="text-[11px] text-gray-400">
            Multi-quantile alpha predictions (p10, p50, p90) trained via HybridQuantileLoss + Champion Asymmetric Skew Filter
          </p>
        </div>
        <span className="text-[10px] bg-[#241334] text-[#c084fc] px-2 py-1 rounded border border-[#a855f7]">
          Fold 14 Retrain (Sep 2026)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Top Conviction Candidates */}
        <div className="bg-[#0c1017] border border-[#1e2633] p-2.5 rounded space-y-2">
          <h3 className="text-xs font-bold text-[#ff9900]">ACTIVE COHORT PICKS (SKEW &ge; 1.25)</h3>
          <div className="space-y-1.5 text-[11px]">
            {candidates.map((c, idx) => {
              const skew =
                c.upside_skew ??
                c.p90_bullish_breakout / Math.max(Math.abs(c.p10_bearish), 0.0001);
              return (
                <div
                  key={c.symbol}
                  className="p-2 bg-[#090d14] rounded flex justify-between items-center border border-[#1b2533]"
                >
                  <div>
                    <div className="text-white font-bold">
                      {idx + 1}. {c.symbol}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      Skew: <span className="text-[#00e5ff] font-bold">{skew.toFixed(2)}x</span> | Sharpe Rank: {c.conviction_score.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#00ff66] font-bold">
                      P50: +{(c.p50_median_alpha * 100).toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-cyan-400">
                      P90: +{(c.p90_bullish_breakout * 100).toFixed(2)}% | P10: {(c.p10_bearish * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Fold 0-14 Evaluation Metrics */}
        <div className="bg-[#0c1017] border border-[#1e2633] p-2.5 rounded space-y-2">
          <h3 className="text-xs font-bold text-[#00e5ff]">ALL-FOLDS OOS EVALUATION (FOLDS 0–14)</h3>
          <div className="space-y-2 text-xs text-gray-300">
            <div className="flex justify-between py-1 border-b border-[#1c2430]">
              <span>Cross-Sectional IC (Daily):</span>
              <span className="text-[#00ff66] font-bold">+0.0172 &plusmn; 0.0790</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1c2430]">
              <span>Annualized IC-IR:</span>
              <span className="text-[#00e5ff] font-bold">3.47 (15/15 Folds &gt; 0)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1c2430]">
              <span>Decile 10 vs Decile 1 Spread:</span>
              <span className="text-[#00ff66] font-bold">+0.45% / 5-day bar</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1c2430]">
              <span>Quantile Coverage (p10 / p50 / p90):</span>
              <span className="text-white font-bold">13.3% / 51.3% / 85.9%</span>
            </div>
          </div>
        </div>

        {/* Champion Entry & Exit Gates */}
        <div className="bg-[#0c1017] border border-[#1e2633] p-2.5 rounded space-y-2">
          <h3 className="text-xs font-bold text-[#ff9900]">CHAMPION STRATEGY GATES (14:50 EOD)</h3>
          <div className="space-y-2 text-xs">
            <div className="bg-[#121b14] border border-[#00ff66] p-2 rounded text-[#00ff66]">
              <div className="font-bold">ENTRY GATES: ASYMMETRIC SKEW + P50</div>
              <div className="text-[10px] text-gray-300 mt-1">
                Require p50 &gt; 0 and p90 / |p10| &ge; 1.25. Ranked by Quantile Sharpe: p50 / (p90 - p10).
              </div>
            </div>
            <div className="bg-[#1c1811] border border-[#ff9900] p-2 rounded text-gray-400">
              <div className="text-[#ff9900] font-bold">EXIT &amp; REBALANCE RULES:</div>
              <div className="text-[10px] mt-1">
                14:45 IST Parquet Candle Flush &rarr; 14:50 IST EOD Rebalance (3 slots/day, 15 slots max). Flat -4.5% stop, +6.0% Target 1 (50% book + +1% ratchet).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
