import { useCallback } from 'react';
import { Asset, Keypair, Transaction } from '@stellar/stellar-sdk';
import { buildChangeTrustTx, buildPaymentTx, server } from '../lib/stellar';
import { USDC_CODE } from '../lib/constants';
import { Grat } from '@grat-official-sdk/sdk';

export function useStellar(grat: Grat) {
  const setupTrustline = useCallback(async (
    keypair: Keypair,
    issuerPublicKey: string,
    onStep: (msg: string) => string,
    onUpdate: (id: string, updates: any) => void
  ) => {
    const usdcAsset = new Asset(USDC_CODE, issuerPublicKey);
    
    const buildId = onStep(`Building USDC trustline transaction...`);
    const tx = await buildChangeTrustTx(keypair.publicKey(), usdcAsset);
    tx.sign(keypair);
    onUpdate(buildId, { status: 'success' });

    const sponsorId = onStep(`Sponsoring trustline via Grat...`);
    try {
      const result = await grat.sponsor(tx);
      onUpdate(sponsorId, { 
        status: 'success', 
        details: `Fee paid by Grat: ${result.feePaid} stroops`,
        txHash: result.hash
      });
      return result;
    } catch (e: any) {
      onUpdate(sponsorId, { status: 'error', details: e.message || 'Sponsorship failed' });
      throw e;
    }
  }, [grat]);

  const sendPayment = useCallback(async (
    fromKp: Keypair,
    toPublicKey: string,
    asset: Asset,
    amount: string,
    onStep: (msg: string) => string,
    onUpdate: (id: string, updates: any) => void
  ) => {
    const buildId = onStep(`Building ${amount} USDC payment...`);
    const tx = await buildPaymentTx(fromKp.publicKey(), toPublicKey, asset, amount);
    tx.sign(fromKp);
    onUpdate(buildId, { status: 'success' });

    const sponsorId = onStep(`Sponsoring payment via Grat...`);
    try {
      const result = await grat.sponsor(tx);
      onUpdate(sponsorId, { 
        status: 'success', 
        details: `Fee paid by Grat: ${result.feePaid} stroops`,
        txHash: result.hash
      });
      return result;
    } catch (e: any) {
      onUpdate(sponsorId, { status: 'error', details: e.message || 'Sponsorship failed' });
      throw e;
    }
  }, [grat]);

  return { setupTrustline, sendPayment };
}
