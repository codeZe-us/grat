import { useState, useCallback } from 'react';
import { Keypair, Asset, TransactionBuilder, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import type { UserAccount } from '../types';
import {
  fundWithFriendbot,
  buildChangeTrustTx,
  loadAccount,
  submitTransaction,
} from '../lib/stellar';
import { grat } from '../lib/grat';
import { USDC_CODE, NETWORK_PASSPHRASE } from '../lib/constants';

export function useAccounts() {
  const [alice, setAlice] = useState<UserAccount | null>(null);
  const [bob, setBob] = useState<UserAccount | null>(null);
  const [charlie, setCharlie] = useState<UserAccount | null>(null);
  const [issuer, setIssuer] = useState<Keypair | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [setupStatus, setSetupStatus] = useState<string>('Initializing...');
  const [setupProgress, setSetupProgress] = useState(0);

  const setup = useCallback(async () => {
    try {
      setSetupProgress(5);
      setSetupStatus('Generating secure keypairs...');
      const aliceKp = Keypair.random();
      const bobKp = Keypair.random();
      const charlieKp = Keypair.random();
      const issuerKp = Keypair.random();
      setIssuer(issuerKp);

      setSetupProgress(10);
      setSetupStatus('Funding issuer via Friendbot...');
      await fundWithFriendbot(issuerKp.publicKey());

      const usdcAsset = new Asset(USDC_CODE, issuerKp.publicKey());

      setSetupProgress(30);
      setSetupStatus('Provisioning user accounts...');
      const issuerAccount = await loadAccount(issuerKp.publicKey());
      const createTx = new TransactionBuilder(issuerAccount, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          Operation.createAccount({ destination: aliceKp.publicKey(), startingBalance: '2.0' }),
        )
        .addOperation(
          Operation.createAccount({ destination: bobKp.publicKey(), startingBalance: '2.0' }),
        )
        .addOperation(
          Operation.createAccount({ destination: charlieKp.publicKey(), startingBalance: '2.0' }),
        )
        .setTimeout(300)
        .build();

      createTx.sign(issuerKp);
      await submitTransaction(createTx);

      setSetupProgress(60);
      setSetupStatus('Setting up USDC trustlines (Sponsored by Grat)...');
      const setupTrust = async (kp: Keypair) => {
        const tx = await buildChangeTrustTx(kp.publicKey(), usdcAsset);
        tx.sign(kp);
        return grat.sponsor(tx);
      };

      await Promise.all([setupTrust(aliceKp), setupTrust(bobKp), setupTrust(charlieKp)]);

      setSetupProgress(80);
      setSetupStatus('Minting demo USDC assets...');
      const mintAccount = await loadAccount(issuerKp.publicKey());
      const mintTx = new TransactionBuilder(mintAccount, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          Operation.payment({
            destination: aliceKp.publicKey(),
            asset: usdcAsset,
            amount: '1000.00',
          }),
        )
        .setTimeout(300)
        .build();

      mintTx.sign(issuerKp);
      await submitTransaction(mintTx);

      setAlice({
        name: 'Alice',
        publicKey: aliceKp.publicKey(),
        secretKey: aliceKp.secret(),
        balance: '1000.00',
      });
      setBob({
        name: 'Bob',
        publicKey: bobKp.publicKey(),
        secretKey: bobKp.secret(),
        balance: '0.00',
      });
      setCharlie({
        name: 'Charlie',
        publicKey: charlieKp.publicKey(),
        secretKey: charlieKp.secret(),
        balance: '0.00',
      });

      setSetupProgress(100);
      setSetupStatus('System ready!');
      setIsReady(true);
      console.log('[Grat Demo] Ready.');
    } catch (e) {
      console.error('[Grat Demo] Setup failed', e);
      setSetupStatus('Setup failed. Please refresh.');
      throw e;
    }
  }, []);

  return {
    alice,
    setAlice,
    bob,
    setBob,
    charlie,
    setCharlie,
    issuer,
    isReady,
    setupStatus,
    setupProgress,
    setup,
  };
}

