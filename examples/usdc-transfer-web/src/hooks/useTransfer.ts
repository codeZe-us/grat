import { useCallback } from 'react';
import { Keypair, Asset } from '@stellar/stellar-sdk';
import { grat } from '../lib/grat';
import { buildPaymentTx } from '../lib/stellar';
import { USDC_CODE } from '../lib/constants';

export function useTransfer() {
  const transfer = useCallback(async (
    fromKp: Keypair,
    toPublicKey: string,
    issuerPublicKey: string,
    amount: string
  ) => {
    console.log(`[Grat Demo] Transfer: Alice → Bob, ${amount} USDC`);
    const usdcAsset = new Asset(USDC_CODE, issuerPublicKey);
    
    console.log('[Grat Demo] Transaction built, signing with Alice keypair...');
    const tx = await buildPaymentTx(fromKp.publicKey(), toPublicKey, usdcAsset, amount);
    tx.sign(fromKp);
    
    console.log('[Grat Demo] Sponsoring via Grat relay...');
    const result = await grat.sponsor(tx);
    console.log(`[Grat Demo] Sponsored! Hash: ${result.hash}, Fee: ${result.feePaid} stroops (paid by Grat)`);
    
    return result;
  }, []);

  return { transfer };
}
