import { useState, useCallback } from 'react';
import { Keypair, Asset, TransactionBuilder, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import type { UserAccount } from '../types';
import { fundWithFriendbot, buildChangeTrustTx, server } from '../lib/stellar';
import { grat } from '../lib/grat';
import { USDC_CODE, NETWORK_PASSPHRASE } from '../lib/constants';

export function useAccounts() {
  const [alice, setAlice] = useState<UserAccount | null>(null);
  const [bob, setBob] = useState<UserAccount | null>(null);
  const [charlie, setCharlie] = useState<UserAccount | null>(null);
  const [issuer, setIssuer] = useState<Keypair | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing...');

  const setup = useCallback(async () => {
    try {
      setStatus('Generating secure keys...');
      setProgress(5);
      const aliceKp = Keypair.random();
      const bobKp = Keypair.random();
      const charlieKp = Keypair.random();
      const issuerKp = Keypair.random();
      setIssuer(issuerKp);

      setStatus('Funding issuer with Friendbot...');
      setProgress(20);
      await fundWithFriendbot(issuerKp.publicKey());

      const usdcAsset = new Asset(USDC_CODE, issuerKp.publicKey());

      setStatus('Creating user accounts on Stellar...');
      setProgress(40);
      const issuerAccount = await server.loadAccount(issuerKp.publicKey());
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
      await server.submitTransaction(createTx);

      setStatus('Setting up USDC trustlines (Sponored by Grat)...');
      setProgress(60);
      const setupTrust = async (kp: Keypair) => {
        const tx = await buildChangeTrustTx(kp.publicKey(), usdcAsset);
        tx.sign(kp);
        return grat.sponsor(tx);
      };

      await Promise.all([setupTrust(aliceKp), setupTrust(bobKp), setupTrust(charlieKp)]);

      setStatus('Minting test USDC to Alice...');
      setProgress(85);
      const mintAccount = await server.loadAccount(issuerKp.publicKey());
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
      await server.submitTransaction(mintTx);

      setStatus('Finishing up...');
      setProgress(100);

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

      setIsReady(true);
      console.log('[Grat Demo] Ready.');
    } catch (e) {
      console.error('[Grat Demo] Setup failed', e);
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
    progress,
    status,
    setup,
  };
}
