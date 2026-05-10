import React, { useState } from 'react';
import { Terminal, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react';
import type { DevStats } from '../types';
import { STELLAR_EXPERT_TX_URL } from '../lib/constants';

interface Props {
  stats: DevStats;
}

export const DevPanel: React.FC<Props> = ({ stats }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-2 p-6 bg-white border border-zinc-200 rounded-3xl shadow-2xl w-[320px] animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-primary/20 text-primary rounded-lg flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-widest">Powered by Grat</h4>
              <a href="https://grat.network" target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">grat.network</a>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Transactions Sponsored</span>
              <span className="text-sm font-mono text-zinc-900">{stats.sponsoredCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Total Fees Paid by Grat</span>
              <span className="text-sm font-mono text-green-500">{stats.totalFeesStroops.toString()} stroops</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Fees Paid by User</span>
              <span className="text-sm font-mono text-green-500">$0.00</span>
            </div>
            
            {stats.lastHash && (
              <div className="pt-4 border-t border-zinc-200">
                <a 
                  href={`${STELLAR_EXPERT_TX_URL}${stats.lastHash}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center justify-between group"
                >
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Last Transaction</span>
                  <ExternalLink className="w-3 h-3 text-zinc-500 group-hover:text-primary transition-colors" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-full text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:bg-zinc-100 transition-colors shadow-lg"
      >
        <Terminal className="w-3 h-3" />
        Developer View
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
      </button>
    </div>
  );
};
