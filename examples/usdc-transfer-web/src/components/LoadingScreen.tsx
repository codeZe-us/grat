import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white text-zinc-900 p-6 text-center">
      <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
      <h2 className="text-xl font-bold mb-2">Setting up your account</h2>
      <p className="text-zinc-500 text-sm max-w-[240px]">
        Just a moment while we get everything ready for you.
      </p>
    </div>
  );
};
