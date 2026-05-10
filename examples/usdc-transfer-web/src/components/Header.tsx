import React from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { ExternalLink } from 'lucide-react';

interface Props {
  isConnected: boolean;
  isChecking: boolean;
}

export const Header: React.FC<Props> = ({ isConnected, isChecking }) => {
  return (
    <header className="w-full max-w-6xl mx-auto py-8 px-4 flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-white font-bold text-xl">G</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Grat USDC Transfer Demo</h1>
        </div>
        <p className="text-white/60 text-sm pl-[52px]">
          All fees sponsored by Grat. No XLM needed for users.
        </p>
      </div>

      <div className="flex items-center gap-4 pl-[52px] md:pl-0">
        <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs font-medium text-white/40">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          Testnet
        </div>
        <ConnectionStatus isConnected={isConnected} isChecking={isChecking} />
        <a 
          href="https://github.com/grat-official" 
          target="_blank" 
          rel="noopener noreferrer"
          className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/40 hover:text-white"
        >
          <ExternalLink className="w-5 h-5" />
        </a>
      </div>
    </header>
  );
};
