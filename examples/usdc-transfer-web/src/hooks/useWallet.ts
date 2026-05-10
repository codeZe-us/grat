import { useState, useCallback } from 'react';
import { Keypair } from '@stellar/stellar-sdk';
import type { WalletState } from '../types';
import { fundWithFriendbot, getAccountBalances } from '../lib/stellar';
import { USDC_CODE } from '../lib/constants';

const INITIAL_STATE: WalletState = {
  publicKey: '',
  secretKey: '',
  xlmBalance: '0',
  usdcBalance: '0',
  hasTrustline: false,
  isCreating: false,
  isFunding: false,
  isSettingTrustline: false,
};

export function useWallet(name: string) {
  const [wallet, setWallet] = useState<WalletState>(INITIAL_STATE);

  const refreshBalances = useCallback(async (publicKey: string, issuerPublicKey?: string) => {
    const balances = await getAccountBalances(publicKey);
    const xlm = balances.find((b) => b.asset_type === 'native');
    const usdc = balances.find((b: any) => 
      b.asset_code === USDC_CODE && 
      (issuerPublicKey ? b.asset_issuer === issuerPublicKey : true)
    );

    setWallet((prev) => ({
      ...prev,
      xlmBalance: xlm?.balance || '0',
      usdcBalance: usdc?.balance || '0',
      hasTrustline: !!usdc,
    }));
    return { xlm: xlm?.balance || '0', usdc: usdc?.balance || '0' };
  }, []);

  const createWallet = useCallback(async (onStep?: (msg: string) => string, onComplete?: (id: string, updates: any) => void) => {
    setWallet(prev => ({ ...prev, isCreating: true }));
    
    // Step 1: Generate Keypair
    const stepId = onStep?.(`Generating keypair for ${name}...`);
    const kp = Keypair.random();
    setWallet(prev => ({ 
      ...prev, 
      publicKey: kp.publicKey(), 
      secretKey: kp.secret(),
      isCreating: false,
      isFunding: true 
    }));
    onComplete?.(stepId!, { status: 'success', details: `Public Key: ${kp.publicKey()}` });

    // Step 2: Fund with Friendbot
    const fundStepId = onStep?.(`Funding ${name} with Friendbot...`);
    try {
      await fundWithFriendbot(kp.publicKey());
      const { xlm } = await refreshBalances(kp.publicKey());
      setWallet(prev => ({ ...prev, isFunding: false }));
      onComplete?.(fundStepId!, { status: 'success', details: `Funded! Balance: ${xlm} XLM` });
    } catch (e) {
      setWallet(prev => ({ ...prev, isFunding: false }));
      onComplete?.(fundStepId!, { status: 'error', details: 'Friendbot failed. Try again.' });
      throw e;
    }
    
    return kp;
  }, [name, refreshBalances]);

  return { wallet, setWallet, createWallet, refreshBalances };
}
