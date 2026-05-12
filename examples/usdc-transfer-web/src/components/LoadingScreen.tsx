import React from 'react';

interface Props {
  status?: string;
  progress?: number;
}

export const LoadingScreen: React.FC<Props> = ({ status = 'Setting up USDC trustlines...', progress = 0 }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-white text-zinc-900 p-8 text-center animate-in fade-in zoom-in duration-500">
      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        <div className="relative mb-10">
          <div className="w-24 h-24 bg-[#F3E8FF] rounded-[2rem] flex items-center justify-center relative overflow-visible">
            <svg className="w-12 h-12 animate-spin text-primary" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-zinc-50">
              <span className="text-[13px] font-black text-primary">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-10">
          <h2 className="text-[28px] font-black tracking-tight text-[#111827]">
            Setting up Demo
          </h2>
          <p className="text-[#94A3B8] text-lg font-medium leading-relaxed max-w-[300px] mx-auto">
            {status}
          </p>
        </div>

        <div className="w-full max-w-[320px]">
          <div className="h-2.5 w-full bg-[#F1F5F9] rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-700 ease-out rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

