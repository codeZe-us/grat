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
    
    try {
      console.log('[Grat Demo] Sponsoring via Grat relay...');
      const result = await grat.sponsor(tx);
      console.log(`[Grat Demo] Sponsored! Hash: ${result.hash}, Fee: ${result.feePaid} stroops (paid by Grat)`);
      return result;
    } catch (e: unknown) {
      const err = e as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('[Grat Demo] useTransfer Error:', err.message);
      if (err.response?.data) {
        console.error('[Grat Demo] Relay Data:', JSON.stringify(err.response.data, null, 2));
      }
      throw err;
    }
  }, []);

  return { transfer };
}
