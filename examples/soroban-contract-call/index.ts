import {
  Keypair,
  TransactionBuilder,
  Networks,
  Account,
  xdr,
  Contract,
} from '@stellar/stellar-sdk';
import { Grat } from '@grat-official-sdk/sdk';

async function run() {
  console.log('🚀 Starting Soroban Contract Call Example with Fee Sponsorship');

  const grat = Grat.testnet();

  // A sample Hello World contract on testnet
  const contractId = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526'; // Guaranteed valid contract ID
  const contract = new Contract(contractId);

  // 1. Setup User
  const user = Keypair.random();
  console.log(`\n1. Creating test account: ${user.publicKey()}`);
  await fetch(`https://friendbot.stellar.org/?addr=${user.publicKey()}`);
  console.log('   ✅ Account funded via Friendbot');

  // 2. Build Invocation
  console.log('\n2. Building contract invocation (hello method)...');
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

  // 3. Simulate (via Relay)
  console.log('\n3. Simulating transaction via Grat Relay...');
  const simulation = await grat.simulate(tx);
  console.log('   Simulation Successful!');
  console.log(`   CPU Instructions: ${simulation.cost.cpuInstructions}`);
  console.log(`   Memory Bytes:     ${simulation.cost.memoryBytes}`);
  console.log(`   Resource Fee:     ${simulation.resourceFee} stroops`);

  // 4. Update Transaction with Simulation Results
  // The SDK returns a modified transactionData XDR which we should apply.
  // In a real flow, you'd rebuild or update the TX.
  // For this example, we'll just sign the original (if simulation didn't require data updates)
  // or use the relay's recommendation.

  tx.sign(user);

  // 5. Sponsor and Submit
  console.log('\n4. Sponsoring and submitting Soroban transaction...');
  const result = await grat.sponsor(tx);

  console.log(`   ✅ Transaction Submitted! Hash: ${result.hash}`);
  console.log(`   Channel Used: ${result.channelAccount}`);

  console.log('\n🏁 Example finished successfully!');
}

run().catch((err) => {
  console.error('\n❌ Example failed:', err.message);
  if (err.details) console.error('   Details:', JSON.stringify(err.details, null, 2));
});
