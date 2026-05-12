import {
  Asset,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  rpc,
  Transaction,
  FeeBumpTransaction,
} from '@stellar/stellar-sdk';
import { RPC_URL, NETWORK_PASSPHRASE } from './constants';

export const server = new rpc.Server(RPC_URL);

interface AssetBalance {
  asset_code?: string;
  asset_issuer?: string;
  balance?: string;
}

export async function fundWithFriendbot(publicKey: string) {
  const url = `https://friendbot.stellar.org?addr=${publicKey}`;
  let lastError;
  
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`Friendbot failed with status: ${response.status}`);
    } catch (e) {
      lastError = e;
    }
    // Wait before retry (1s, 2s, 4s...)
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
  }
  throw lastError;
}


/**
 * Loads account data from RPC and returns a TransactionBuilder-compatible Account object.
 * Retries if the account is not found immediately (e.g. after Friendbot funding).
 */
export async function loadAccount(publicKey: string, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      return await server.getAccount(publicKey);
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error(`Failed to load account: ${publicKey}`);
}


/**
 * Submits a transaction to RPC and polls for the result.
 * Handles 'NOT_FOUND' as a pending state for up to 30 seconds to account for indexing delays.
 */
export async function submitTransaction(tx: Transaction | FeeBumpTransaction) {
  const response = await server.sendTransaction(tx);
  if (response.status === 'ERROR') {
    throw new Error(`Transaction submission failed: ${JSON.stringify(response)}`);
  }

  const start = Date.now();
  const timeout = 60000; // 60 seconds

  while (Date.now() - start < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const result = await server.getTransaction(response.hash);
    
    if (result.status === 'SUCCESS') {
      return result;
    }
    
    if (result.status === 'FAILED') {
      throw new Error(`Transaction failed: ${JSON.stringify(result)}`);
    }

    // If status is NOT_FOUND or PENDING, keep polling
    console.log(`[Stellar] Tx ${response.hash} status: ${result.status}, still polling...`);
  }

  throw new Error(`Transaction confirmation timed out after ${timeout/1000}s`);
}

export async function buildChangeTrustTx(
  publicKey: string,
  asset: Asset,
  fee: string = BASE_FEE
) {
  const account = await loadAccount(publicKey);
  return new TransactionBuilder(account, {
    fee,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset,
      })
    )
    .setTimeout(300)
    .build();
}

export async function buildPaymentTx(
  fromPublicKey: string,
  toPublicKey: string,
  asset: Asset,
  amount: string,
  fee: string = BASE_FEE
) {
  const account = await loadAccount(fromPublicKey);
  return new TransactionBuilder(account, {
    fee,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: toPublicKey,
        asset,
        amount,
      })
    )
    .setTimeout(300)
    .build();
}

export async function getUSDCBalance(publicKey: string, issuerPublicKey: string) {
  try {
    // Note: This relies on the RPC implementation providing classic balances in getAccount.
    // If the RPC doesn't provide them, this will return '0'.
    const account = await server.getAccount(publicKey) as unknown as { balances?: AssetBalance[] };
    const usdc = account.balances?.find(
      (b) => b.asset_code === 'USDC' && b.asset_issuer === issuerPublicKey
    );
    return usdc?.balance || '0';
  } catch (e) {
    return '0';
  }
}
