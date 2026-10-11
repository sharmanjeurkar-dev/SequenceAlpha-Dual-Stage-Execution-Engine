import React, { useState } from 'react';

interface TerminalCommandLineProps {
  onExecuteCommand: (command: string) => void;
  onSwitchTab: (tab: 'dashboard' | 'slots' | 'equity' | 'dual' | 'tft' | 'blotter') => void;
}

export const TerminalCommandLine: React.FC<TerminalCommandLineProps> = ({
  onExecuteCommand,
  onSwitchTab,
}) => {
  const [cmd, setCmd] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cmd.trim()) {
      onExecuteCommand(cmd.trim());
      setCmd('');
    }
  };

  return (
    <footer className="bg-[#0a0d14] border-t border-[#1e2633] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono select-none">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1 max-w-3xl">
        <span className="text-[#ff9900] font-extrabold flex items-center gap-1">
          <span className="text-base leading-none">&gt;</span>
          <span>CMD:</span>
        </span>
        <input
          type="text"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="Type command (e.g., BUY RESPONIND 465, RATCHET 0, EQUITY, LEDGER, HALT, HELP) and press <ENTER>..."
          className="flex-1 bg-[#05070a] border border-[#232d3d] focus:border-[#ff9900] focus:outline-none px-2.5 py-1 text-white font-mono text-xs rounded-sm placeholder-gray-600"
        />
        <button
          type="submit"
          className="px-3 py-1 bg-[#ff9900] hover:bg-[#ffb000] text-black font-extrabold rounded-sm text-xs transition-colors"
        >
          EXEC &lt;GO&gt;
        </button>
      </form>

      <div className="flex items-center gap-3 text-[11px] text-[#7d8590]">
        <span>HOTKEYS:</span>
        <button
          onClick={() => onSwitchTab('dashboard')}
          className="text-white hover:text-[#ff9900] cursor-pointer"
        >
          [F1: GRID]
        </button>
        <button
          onClick={() => onSwitchTab('slots')}
          className="text-white hover:text-[#ff9900] cursor-pointer"
        >
          [F2: SLOTS]
        </button>
        <button
          onClick={() => onSwitchTab('equity')}
          className="text-[#00ff66] hover:text-white cursor-pointer font-bold"
        >
          [F3: EQUITY CURVE]
        </button>
        <button
          onClick={() => onSwitchTab('dual')}
          className="text-white hover:text-[#ff9900] cursor-pointer"
        >
          [F4: EOD LEDGER]
        </button>
        <button
          onClick={() => onSwitchTab('tft')}
          className="text-white hover:text-[#ff9900] cursor-pointer"
        >
          [F5: TFT ALPHA]
        </button>
        <button
          onClick={() => onSwitchTab('blotter')}
          className="text-white hover:text-[#ff9900] cursor-pointer"
        >
          [F6: BLOTTER]
        </button>
      </div>
    </footer>
  );
};
