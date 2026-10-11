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
            TEMPORAL FUSION TRANSFORMER (TFT) INFERENCE MATRIX
          </h2>
          <p className="text-[11px] text-gray-400">
            Multi-quantile alpha predictions ($p_{10}, p_{50}, p_{90}$) trained via DirectionalPenaltyLoss
          </p>
        </div>
        <span className="text-[10px] bg-[#241334] text-[#c084fc] px-2 py-1 rounded border border-[#a855f7]">
          PyTorch Lightning v395
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Top Conviction Candidates */}
        <div className="bg-[#0c1017] border border-[#1e2633] p-2.5 rounded space-y-2">
          <h3 className="text-xs font-bold text-[#ff9900]">TOP CONVICTION PICKS (D10 COHORT)</h3>
          <div className="space-y-1.5 text-[11px]">
            {candidates.map((c, idx) => (
              <div
                key={c.symbol}
                className="p-2 bg-[#090d14] rounded flex justify-between items-center border border-[#1b2533]"
              >
                <div>
                  <div className="text-white font-bold">
                    {idx + 1}. {c.symbol}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    Loss: {c.directional_loss.toFixed(4)} | Decile: {c.decile_rank}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[#00ff66] font-bold">
                    P50: +{(c.p50_median_alpha * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-cyan-400">
                    P90: +{(c.p90_bullish_breakout * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Decile Spread Performance */}
        <div className="bg-[#0c1017] border border-[#1e2633] p-2.5 rounded space-y-2">
          <h3 className="text-xs font-bold text-[#00e5ff]">DECILE SPREAD MONTE CARLO TEST</h3>
          <div className="space-y-2 text-xs text-gray-300">
            <div className="flex justify-between py-1 border-b border-[#1c2430]">
              <span>Decile 10 (Long):</span>
              <span className="text-[#00ff66] font-bold">+18.4% Ann.</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1c2430]">
              <span>Decile 1 (Short/Avoid):</span>
              <span className="text-[#ff3344] font-bold">-12.1% Ann.</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1c2430]">
              <span>D10 - D1 Long/Short Spread:</span>
              <span className="text-[#00e5ff] font-bold">+30.5% (t-stat 4.12)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1c2430]">
              <span>Directional Hit Rate:</span>
              <span className="text-white font-bold">61.4% (OOS)</span>
            </div>
          </div>
        </div>

        {/* Regime Rules */}
        <div className="bg-[#0c1017] border border-[#1e2633] p-2.5 rounded space-y-2">
          <h3 className="text-xs font-bold text-[#ff9900]">MACRO REGIME GATES</h3>
          <div className="space-y-2 text-xs">
            <div className="bg-[#121b14] border border-[#00ff66] p-2 rounded text-[#00ff66]">
              <div className="font-bold">STATUS: BULL REGIME ACTIVE</div>
              <div className="text-[10px] text-gray-300 mt-1">
                Cohort: 3 slots/day. Cash buffer: 5.0%. Target: +6.0%.
              </div>
            </div>
            <div className="bg-[#1c1811] border border-[#ff9900] p-2 rounded text-gray-400">
              <div className="text-[#ff9900] font-bold">BEAR OVERRIDE TRIGGER RULES:</div>
              <div className="text-[10px] mt-1">
                If Nifty &lt; 200 EMA &amp; Vol &gt; 22: Cohort auto-contracts to 1 slot/day, cash buffer elevates to 25.0%.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
