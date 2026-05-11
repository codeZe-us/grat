import {
  Asset,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  rpc,
} from '@stellar/stellar-sdk';
import { RPC_URL, NETWORK_PASSPHRASE } from './constants';

export const server = new rpc.Server(RPC_URL);

export async function fundWithFriendbot(publicKey: string) {
  const response = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!response.ok) {
    throw new Error('Funding failed');
  }
  return response.json();
}

export async function buildChangeTrustTx(
  publicKey: string,
  asset: Asset,
  fee: string = BASE_FEE
) {
  const account = await server.getAccount(publicKey);
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
  const account = await server.getAccount(fromPublicKey);
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
    const account = await server.getAccount(publicKey) as any;
    const usdc = account.balances?.find(
      (b: any) => b.asset_code === 'USDC' && b.asset_issuer === issuerPublicKey
    );
    return usdc?.balance || '0';
  } catch (e) {
    return '0';
  }
}
