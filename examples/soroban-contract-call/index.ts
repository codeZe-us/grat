import {
  Keypair,
  TransactionBuilder,
  Networks,
  Account,
  xdr,
  Contract,
  Asset,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { Grat, FrozenEntryError } from '@grat-official-sdk/sdk';

async function run() {
  console.log('Starting Soroban Contract Call Example with Fee Sponsorship');

  const grat = Grat.testnet();
  // We use the Native XLM Soroban contract for this example to ensure it survives Testnet resets
  const contractId = Asset.native().contractId(Networks.TESTNET);
  const contract = new Contract(contractId);

  const user = Keypair.random();
  console.log(`\nCreating test account: ${user.publicKey()}`);
  await fetch(`https://friendbot.stellar.org/?addr=${user.publicKey()}`);
  console.log('✅ Account funded via Friendbot');
  console.log('Waiting for network sync (polling Horizon)...');

  async function getAccountInfo(publicKey: string): Promise<any> {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}`);
      if (res.ok) return res.json();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error(`Failed to fetch account info for ${publicKey} after 10 attempts`);
  }

  console.log('\nBuilding contract invocation (hello method)...');
  const userInfo = await getAccountInfo(user.publicKey());

  const op = contract.call('balance', nativeToScVal(user.publicKey(), { type: 'address' }));
  
  const tx = new TransactionBuilder(new Account(user.publicKey(), userInfo.sequence), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  console.log('\nSimulating transaction via Grat Relay...');
  const simulation = await grat.simulate(tx);
  console.log('Simulation Successful!');
  console.log(`Resource Fee:     ${simulation.resourceFee} stroops`);

  // For Soroban, you must rebuild the transaction with the simulation data (footprint) attached
  const finalTx = new TransactionBuilder(new Account(user.publicKey(), userInfo.sequence), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .setSorobanData(xdr.SorobanTransactionData.fromXDR(simulation.transactionData, 'base64'))
    .addOperation(op)
    .setTimeout(30)
    .build();

  finalTx.sign(user);

  console.log('\nSponsoring and submitting Soroban transaction...');
  const result = await grat.sponsor(finalTx);

  console.log(`✅ Transaction Submitted! Hash: ${result.hash}`);
  console.log(`Channel Used: ${result.channelAccount}`);

  console.log('\n🏁 Example finished successfully!');
}

run().catch((err) => {
  if (err instanceof FrozenEntryError) {
    console.error('\n❌ Action Restricted: One or more ledger entries are currently frozen by the network.');
    if (err.frozenKeys) console.log('   Frozen Keys:', err.frozenKeys);
  } else {
    console.error('\n❌ Example failed:', err.message);
    if (err.details) console.error('   Details:', JSON.stringify(err.details, null, 2));
  }
});
