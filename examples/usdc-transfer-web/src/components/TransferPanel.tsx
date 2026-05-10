import React, { useState } from 'react';
import { Send, ArrowRightLeft, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  aliceReady: boolean;
  bobReady: boolean;
  onSend: (amount: string) => void;
  isProcessing: boolean;
  aliceBalance: string;
}

export const TransferPanel: React.FC<Props> = ({ 
  aliceReady, 
  bobReady, 
  onSend, 
  isProcessing,
  aliceBalance
}) => {
  const [amount, setAmount] = useState('10.00');
  const [error, setError] = useState('');

  const handleSend = () => {
    const numAmount = parseFloat(amount);
    const numBalance = parseFloat(aliceBalance);

    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }

    if (numAmount > numBalance) {
      setError('Insufficient USDC balance');
      return;
    }

    setError('');
    onSend(amount);
  };

  const isDisabled = !aliceReady || !bobReady || isProcessing;

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 gap-6">
      <div className="p-4 rounded-full bg-primary/10 border border-primary/20 text-primary shadow-inner">
        <ArrowRightLeft className="w-8 h-8" />
      </div>

      <div className="w-full max-w-[200px] space-y-4">
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-center text-2xl font-bold text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 transition-colors"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-white/20 uppercase tracking-widest pointer-events-none">
            USDC
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-bold uppercase tracking-wider px-2">
            <AlertCircle className="w-3 h-3" />
            {error}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={isDisabled}
          className="w-full py-4 bg-primary hover:bg-primary-dark disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group"
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Send USDC
              <Send className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </>
          )}
        </button>

        {!aliceReady || !bobReady ? (
          <p className="text-[10px] text-center text-white/30 font-medium leading-relaxed">
            Initialize both wallets to enable transfers
          </p>
        ) : (
          <p className="text-[10px] text-center text-white/30 font-medium leading-relaxed">
            Grat will pay the network fee
          </p>
        )}
      </div>
    </div>
  );
};
