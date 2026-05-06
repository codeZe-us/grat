import {
  Keypair,
  TransactionBuilder,
  Networks,
  Account,
  xdr,
  Contract,
} from '@stellar/stellar-sdk';
import { Grat, FrozenEntryError } from '@grat-official-sdk/sdk';

async function run() {
  console.log('🚀 Starting Soroban Contract Call Example with Fee Sponsorship');

  const grat = Grat.testnet();
  const contractId = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';
  const contract = new Contract(contractId);

  const user = Keypair.random();
  console.log(`\nCreating test account: ${user.publicKey()}`);
  await fetch(`https://friendbot.stellar.org/?addr=${user.publicKey()}`);
  console.log('✅ Account funded via Friendbot');

  console.log('\nBuilding contract invocation (hello method)...');
  const userInfo = await (
    await fetch(`https://horizon-testnet.stellar.org/accounts/${user.publicKey()}`)
  ).json();

  const tx = new TransactionBuilder(new Account(user.publicKey(), userInfo.sequence), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call('hello', xdr.ScVal.scvSymbol('World')))
    .setTimeout(30)
    .build();

  console.log('\nSimulating transaction via Grat Relay...');
  const simulation = await grat.simulate(tx);
  console.log('Simulation Successful!');
  console.log(`Resource Fee:     ${simulation.resourceFee} stroops`);

  tx.sign(user);

  console.log('\nSponsoring and submitting Soroban transaction...');
  const result = await grat.sponsor(tx);

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
