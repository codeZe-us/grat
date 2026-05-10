import React from 'react';
import { ShieldCheck, Zap, UserX } from 'lucide-react';
import type { FeeStats } from '../types';

interface Props {
  stats: FeeStats;
}

export const FeeSummary: React.FC<Props> = ({ stats }) => {
  const totalXLM = (Number(stats.totalFeesStroops) / 10000000).toFixed(7);

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="p-6 rounded-3xl bg-primary/10 border border-primary/20 shadow-lg shadow-primary/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/20 text-primary">
            <Zap className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-white/80 uppercase tracking-widest">Sponsored by Grat</h4>
        </div>
        <div className="space-y-1">
          <div className="text-3xl font-bold text-white font-mono">
            {stats.sponsoredCount}
          </div>
          <p className="text-xs text-white/40 font-medium">Total Transactions</p>
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-green-500/10 border border-green-500/20 shadow-lg shadow-green-500/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-green-500/20 text-green-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-white/80 uppercase tracking-widest">Grat Paid Total</h4>
        </div>
        <div className="space-y-1">
          <div className="text-3xl font-bold text-white font-mono">
            {totalXLM} <span className="text-lg text-white/40">XLM</span>
          </div>
          <p className="text-xs text-white/40 font-medium">{stats.totalFeesStroops.toString()} stroops</p>
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-white/10 text-white/60">
            <UserX className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-white/80 uppercase tracking-widest">Users Paid</h4>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40 font-medium">Alice</span>
            <span className="text-sm font-bold text-green-400 font-mono">0.0000000 XLM</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40 font-medium">Bob</span>
            <span className="text-sm font-bold text-green-400 font-mono">0.0000000 XLM</span>
          </div>
        </div>
      </div>
    </div>
  );
};
