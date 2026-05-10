import React from 'react';
import { Copy, CheckCircle2, User, Wallet, Coins, PlusCircle, Loader2 } from 'lucide-react';
import type { WalletState } from '../types';
import { STELLAR_EXPERT_ACCOUNT_URL } from '../lib/constants';

interface Props {
  name: string;
  wallet: WalletState;
  color: string;
  onCreate: () => void;
  disabled?: boolean;
}

export const WalletCard: React.FC<Props> = ({ name, wallet, color, onCreate, disabled }) => {
  const isCreated = !!wallet.publicKey;

  const truncateKey = (key: string) => {
    if (!key) return '';
    return `${key.slice(0, 6)}...${key.slice(-6)}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className={`relative flex flex-col p-6 rounded-3xl border transition-all duration-300 ${
      isCreated 
        ? 'bg-white/[0.03] border-white/10' 
        : 'bg-white/[0.01] border-white/5 border-dashed'
    }`}>
      {/* Avatar & Name */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl ${color}`}>
            <User className="text-white w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{name}</h3>
            {isCreated ? (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono text-white/40">{truncateKey(wallet.publicKey)}</span>
                <button 
                  onClick={() => copyToClipboard(wallet.publicKey)}
                  className="p-1 hover:bg-white/5 rounded transition-colors text-white/20 hover:text-white/60"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <span className="text-xs text-white/20 italic">Not initialized</span>
            )}
          </div>
        </div>
        {wallet.hasTrustline && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 rounded-full border border-green-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Trustline Active</span>
          </div>
        )}
      </div>

      {/* Balances */}
      <div className="space-y-4 mb-8">
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-white/40 flex items-center gap-1.5">
              <Wallet className="w-3 h-3" /> XLM Balance
            </span>
            <span className="text-xs text-white/20">Native</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">
            {Number(wallet.xlmBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 })}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-primary/60 flex items-center gap-1.5">
              <Coins className="w-3 h-3" /> USDC Balance
            </span>
            <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 bg-primary/10 rounded border border-primary/20 uppercase tracking-wider">Asset</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">
            {Number(wallet.usdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Action */}
      {!isCreated ? (
        <button
          onClick={onCreate}
          disabled={disabled || wallet.isCreating}
          className="w-full py-4 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group"
        >
          {wallet.isCreating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <PlusCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
              Initialize Wallet
            </>
          )}
        </button>
      ) : (
        <a
          href={`${STELLAR_EXPERT_ACCOUNT_URL}${wallet.publicKey}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-4 bg-white/5 hover:bg-white/10 text-white/60 font-semibold rounded-2xl transition-all border border-white/10 flex items-center justify-center gap-2"
        >
          View on Explorer
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        </a>
      )}
    </div>
  );
};
