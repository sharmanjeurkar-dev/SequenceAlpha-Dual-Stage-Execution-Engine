import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Clock, Volume2, VolumeX } from 'lucide-react';

interface HeaderProps {
  wsConnected: boolean;
  regime: string;
  engineArmed: boolean;
  audioEnabled: boolean;
  onToggleAudio: () => void;
}

export const BloombergHeader: React.FC<HeaderProps> = ({
  wsConnected,
  regime,
  engineArmed,
  audioEnabled,
  onToggleAudio,
}) => {
  const [istTime, setIstTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setIstTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour12: false,
        }) + ' IST'
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-[#0b0e14] border-b border-[#212936] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono select-none">
      <div className="flex items-center gap-3">
        <div className="bg-[#ff9900] text-black font-extrabold px-2 py-0.5 rounded-sm tracking-wider flex items-center gap-1.5 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
          <span>ALPHA &lt;GO&gt;</span>
        </div>
        <span className="font-bold text-[#ff9900] tracking-wide">SEQUENCE_ALPHA v2.4</span>
        <span className="text-[#7d8590]">|</span>
        <span className="text-gray-300 font-semibold hidden md:inline">
          TFT 14:50 EOD EXECUTION ENGINE (FYERS WS + KITE)
        </span>
        <span
          className={`text-[11px] px-1.5 py-0.2 rounded font-mono border ${
            engineArmed
              ? 'bg-[#162118] border-[#00ff66] text-[#00ff66]'
              : 'bg-[#2a0e12] border-[#ff3344] text-[#ff3344]'
          }`}
        >
          {engineArmed ? 'ENGINE: ARMED & RUNNING' : 'ENGINE: STANDBY'}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <Activity
            className={`w-3.5 h-3.5 ${
              wsConnected ? 'text-[#00ff66] animate-pulse' : 'text-[#ff3344]'
            }`}
          />
          <span className="text-gray-400">FYERS WS:</span>
          <span className={`font-bold ${wsConnected ? 'text-[#00ff66]' : 'text-[#ff3344]'}`}>
            {wsConnected ? 'LIVE (5s THROTTLE)' : 'SIMULATED / REST'}
          </span>
        </div>

        <span className="text-[#7d8590]">|</span>

        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#ff9900]" />
          <span className="text-gray-400">REGIME:</span>
          <span className="text-[#ff9900] font-bold bg-[#291e0a] px-1 py-0.5 rounded border border-[#664200]">
            {regime}
          </span>
        </div>

        <span className="text-[#7d8590]">|</span>

        <div className="flex items-center gap-1.5 font-bold">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-white bg-[#131b26] px-2 py-0.5 rounded border border-[#212936]">
            {istTime || '14:50:00 IST'}
          </span>
        </div>

        <button
          onClick={onToggleAudio}
          className="px-2 py-0.5 bg-[#1b222d] hover:bg-[#253040] text-amber-400 border border-[#2b3545] rounded text-[11px] flex items-center gap-1"
          title="Toggle Bloomberg Audio Feedback"
        >
          {audioEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          <span>{audioEnabled ? '[AUDIO: ON]' : '[MUTED]'}</span>
        </button>
      </div>
    </header>
  );
};
