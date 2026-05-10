import React from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Clock, 
  ExternalLink, 
  ChevronRight,
  Info
} from 'lucide-react';
import type { LogStep } from '../types';
import { STELLAR_EXPERT_TX_URL } from '../lib/constants';

interface Props {
  steps: LogStep[];
}

export const StepLog: React.FC<Props> = ({ steps }) => {
  return (
    <div className="w-full bg-white/[0.02] border border-white/5 rounded-3xl p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          Execution Log
          <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] text-white/40 font-mono uppercase tracking-widest">
            Real-time
          </span>
        </h3>
        <div className="text-[10px] text-white/40 font-medium">
          {steps.length} {steps.length === 1 ? 'step' : 'steps'} recorded
        </div>
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
        {steps.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-white/20 gap-3 border border-white/5 border-dashed rounded-2xl">
            <Info className="w-8 h-8 opacity-20" />
            <p className="text-sm font-medium">No activity yet. Start by initializing Alice's wallet.</p>
          </div>
        ) : (
          [...steps].reverse().map((step) => (
            <div 
              key={step.id} 
              className={`p-4 rounded-2xl border transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 ${
                step.status === 'error' 
                  ? 'bg-red-500/5 border-red-500/20' 
                  : step.status === 'success'
                    ? 'bg-green-500/5 border-green-500/10'
                    : 'bg-white/5 border-white/10'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  {step.status === 'loading' && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                  {step.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                  {step.status === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
                  {step.status === 'pending' && <Clock className="w-5 h-5 text-white/20" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className={`text-sm font-bold truncate ${
                      step.status === 'error' ? 'text-red-400' : 'text-white/90'
                    }`}>
                      {step.message}
                    </p>
                    <span className="text-[10px] font-mono text-white/20 shrink-0">
                      {step.timestamp.toLocaleTimeString()}
                    </span>
                  </div>

                  {step.details && (
                    <p className="text-xs text-white/40 mt-1 leading-relaxed break-words">
                      {step.details}
                    </p>
                  )}

                  {step.txHash && (
                    <div className="mt-3 flex items-center gap-2">
                      <a 
                        href={`${STELLAR_EXPERT_TX_URL}${step.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold text-primary hover:text-primary-dark transition-colors flex items-center gap-1 group"
                      >
                        EXPLORER
                        <ExternalLink className="w-3 h-3 group-hover:scale-110 transition-transform" />
                      </a>
                      <div className="w-1 h-1 rounded-full bg-white/10" />
                      <span className="text-[10px] font-mono text-white/40 truncate">
                        {step.txHash.slice(0, 16)}...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
