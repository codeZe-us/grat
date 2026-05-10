import React from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface Props {
  isConnected: boolean;
  isChecking: boolean;
}

export const ConnectionStatus: React.FC<Props> = ({ isConnected, isChecking }) => {
  if (isChecking) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs font-medium text-white/60">
        <Loader2 className="w-3 h-3 animate-spin" />
        Checking Relay...
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
      isConnected 
        ? 'bg-green-500/10 border-green-500/20 text-green-400' 
        : 'bg-red-500/10 border-red-500/20 text-red-400'
    }`}>
      {isConnected ? (
        <>
          <Wifi className="w-3 h-3" />
          Relay Online
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          Relay Offline
        </>
      )}
    </div>
  );
};
