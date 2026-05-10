import React from 'react';
import { Check, XCircle } from 'lucide-react';

interface Props {
  status: 'success' | 'error';
  amount: string;
  recipient: string;
  onDone: () => void;
}

export const Confirmation: React.FC<Props> = ({ status, amount, recipient, onDone }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white text-zinc-900 p-6 text-center animate-in fade-in zoom-in duration-300">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-8 ${
        status === 'success' ? 'bg-green-500 text-white shadow-2xl shadow-green-500/20' : 'bg-red-500 text-white shadow-2xl shadow-red-500/20'
      }`}>
        {status === 'success' ? <Check className="w-10 h-10" /> : <XCircle className="w-10 h-10" />}
      </div>
      
      <h2 className="text-3xl font-bold mb-2">
        {status === 'success' ? 'Sent!' : 'Failed'}
      </h2>
      
      <p className="text-zinc-500 text-lg mb-12">
        {status === 'success' 
          ? `You sent $${amount} to ${recipient}` 
          : 'Something went wrong. Please try again.'}
      </p>

      <button
        onClick={onDone}
        className="w-full max-w-[200px] py-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-bold rounded-2xl transition-all border border-zinc-200"
      >
        Done
      </button>
    </div>
  );
};
