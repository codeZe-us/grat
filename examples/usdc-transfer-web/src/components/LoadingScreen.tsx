import React from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  progress: number;
  status: string;
}

export const LoadingScreen: React.FC<Props> = ({ progress, status }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white text-zinc-900 p-6 text-center">
      <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-8 relative">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white border-4 border-white shadow-lg rounded-full flex items-center justify-center text-[10px] font-black text-primary">
          {Math.round(progress)}%
        </div>
      </div>
      
      <div className="space-y-4 w-full max-w-[280px]">
        <div className="space-y-2">
          <h2 className="text-xl font-black tracking-tight text-zinc-900">Setting up Demo</h2>
          <p className="text-zinc-500 text-sm font-medium animate-pulse">
            {status}
          </p>
        </div>

        <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-out rounded-full shadow-[0_0_12px_rgba(var(--primary-rgb),0.4)]"
            style={{ width: `${progress}%` }}
          />
        </div>

      </div>
    </div>
  );
};
