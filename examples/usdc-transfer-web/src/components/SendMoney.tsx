import React, { useState, useEffect } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { AmountInput } from './AmountInput';
import { RecipientPill } from './RecipientPill';
import { ActivityList } from './ActivityList';
import type { ActivityItem, UserAccount } from '../types';

interface Props {
  user: UserAccount;
  otherUsers: string[];
  onSend: (amount: string, recipient: string, note: string) => void;
  onSwitch: (name: string) => void;
  activities: ActivityItem[];
  isSending: boolean;
}

export const SendMoney: React.FC<Props> = ({ user, otherUsers, onSend, onSwitch, activities, isSending }) => {
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState(otherUsers[0]);
  const [note, setNote] = useState('');
  const [showSwitch, setShowSwitch] = useState(false);

  useEffect(() => {
    setAmount('');
    setNote('');
    setRecipient(otherUsers[0]);
  }, [user.name]);

  const getRecipientColor = (name: string) => {
    if (name === 'Alice') return 'bg-primary';
    if (name === 'Bob') return 'bg-blue-600';
    return 'bg-pink-600';
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-zinc-900 max-w-[420px] mx-auto overflow-x-hidden">
      <header className="p-6 flex items-center justify-between relative">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${getRecipientColor(user.name)} flex items-center justify-center text-white font-bold`}>
            {user.name[0]}
          </div>
          <span className="text-sm font-bold text-zinc-600">Hi, {user.name}</span>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowSwitch(!showSwitch)}
            className="px-4 py-2 rounded-full bg-zinc-100 border border-zinc-200 flex items-center gap-2 hover:bg-zinc-200 transition-colors"
          >
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Switch</span>
            <Plus className={`w-3 h-3 text-zinc-500 transition-transform ${showSwitch ? 'rotate-45' : ''}`} />
          </button>

          {showSwitch && (
            <div className="absolute top-full right-0 mt-2 p-2 bg-white border border-zinc-200 rounded-2xl shadow-xl z-20 w-[140px] animate-in slide-in-from-top-2 duration-200">
              {otherUsers.map(name => (
                <button
                  key={name}
                  onClick={() => {
                    onSwitch(name);
                    setShowSwitch(false);
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-bold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 p-6 space-y-12">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Current Balance</span>
          <span className="text-4xl font-bold">${user.balance}</span>
        </div>

        <div className="py-8">
          <AmountInput value={amount} onChange={setAmount} />
        </div>

        <div className="space-y-4">
          <div className="space-y-3">
            <span className="text-sm font-bold text-zinc-500">To</span>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {otherUsers.map(name => (
                <button 
                  key={name}
                  onClick={() => setRecipient(name)}
                  className="transition-transform active:scale-95"
                >
                  <div className={`transition-all duration-300 ${recipient === name ? 'opacity-100 scale-100' : 'opacity-40 scale-90 grayscale'}`}>
                    <RecipientPill name={name} avatarColor={getRecipientColor(name)} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-zinc-500">What's this for?</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dinner, rent, etc."
              className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        <button
          onClick={() => onSend(amount, recipient, note)}
          disabled={isSending || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
          className="w-full py-5 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:grayscale text-white font-bold rounded-2xl transition-all shadow-2xl shadow-primary/20 flex items-center justify-center gap-3 group"
        >
          {isSending ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              Send
              <span className="w-1.5 h-1.5 rounded-full bg-white/30 group-hover:bg-white/60" />
              Transfer
            </>
          )}
        </button>

        <div className="pt-8">
          <ActivityList activities={activities} currentUser={user.name} />
        </div>
      </main>
    </div>
  );
};
