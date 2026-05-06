import { Keypair, Asset, Operation, TransactionBuilder, Networks, Account } from '@stellar/stellar-sdk';
import { Grat, FrozenEntryError } from '@grat-official-sdk/sdk';

async function run() {
  console.log('🚀 Starting USDC Transfer Example with Fee Sponsorship');
  
  const grat = Grat.testnet();
  const issuer = Keypair.random();
  const usdc = new Asset('USDC', issuer.publicKey());

  const alice = Keypair.random();
  const bob = Keypair.random();

  console.log(`\n1. Creating test accounts...`);
  console.log(`   Alice: ${alice.publicKey()}`);
  console.log(`   Bob:   ${bob.publicKey()}`);

  await Promise.all([
    fetch(`https://friendbot.stellar.org/?addr=${alice.publicKey()}`),
    fetch(`https://friendbot.stellar.org/?addr=${bob.publicKey()}`),
    fetch(`https://friendbot.stellar.org/?addr=${issuer.publicKey()}`)
  ]);
  console.log('   ✅ Accounts funded with XLM for base reserve (via Friendbot)');
  console.log('   Waiting for network sync...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\n--- TRUSTLINE SETUP ---');
  const aliceInfo = await (await fetch(`https://horizon-testnet.stellar.org/accounts/${alice.publicKey()}`)).json();
  
  const trustlineTx = new TransactionBuilder(
    new Account(alice.publicKey(), aliceInfo.sequence),
    { fee: '100', networkPassphrase: Networks.TESTNET }
  )
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(30)
    .build();

  trustlineTx.sign(alice);

  console.log('   Sponsoring trustline fee...');
  const trustlineResult = await grat.sponsor(trustlineTx);
  console.log(`   ✅ Trustline established! Hash: ${trustlineResult.hash}`);

  console.log('\n--- BOB TRUSTLINE SETUP ---');
  const bobInfo = await (await fetch(`https://horizon-testnet.stellar.org/accounts/${bob.publicKey()}`)).json();
  const bobTrustlineTx = new TransactionBuilder(
    new Account(bob.publicKey(), bobInfo.sequence),
    { fee: '100', networkPassphrase: Networks.TESTNET }
  )
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(30)
    .build();
  bobTrustlineTx.sign(bob);
  await grat.sponsor(bobTrustlineTx);
  console.log('   ✅ Bob is ready to receive USDC.');
  

  console.log('\n3.5. Minting 100 USDC for Alice (SPONSORED)...');
  const issuerInfo = await (await fetch(`https://horizon-testnet.stellar.org/accounts/${issuer.publicKey()}`)).json();
  const mintTx = new TransactionBuilder(
    new Account(issuer.publicKey(), issuerInfo.sequence),
    { fee: '100', networkPassphrase: Networks.TESTNET }
  )
    .addOperation(Operation.payment({
      destination: alice.publicKey(),
      asset: usdc,
      amount: '100'
    }))
    .setTimeout(30)
    .build();
  mintTx.sign(issuer);
  await grat.sponsor(mintTx);
  console.log('   ✅ Alice received 100 USDC.');

  console.log('\n--- USDC TRANSFER ---');
  const aliceInfo2 = await (await fetch(`https://horizon-testnet.stellar.org/accounts/${alice.publicKey()}`)).json();
  
  const paymentTx = new TransactionBuilder(
    new Account(alice.publicKey(), aliceInfo2.sequence),
    { fee: '100', networkPassphrase: Networks.TESTNET }
  )
    .addOperation(Operation.payment({
      destination: bob.publicKey(),
      asset: usdc,
      amount: '50'
    }))
    .setTimeout(30)
    .build();

  paymentTx.sign(alice);

  console.log('   Sponsoring payment fee...');
  const paymentResult = await grat.sponsor(paymentTx);
  console.log(`   ✅ Payment sent! Hash: ${paymentResult.hash}`);
  console.log(`   Alice's XLM balance remained untouched (except for base reserve).`);
  
  console.log('\n🏁 Example finished successfully!');
}

run().catch(err => {
  if (err instanceof FrozenEntryError) {
    console.error('\n❌ Action Restricted: One or more ledger entries are currently frozen by the network.');
  } else {
    console.error('\n❌ Example failed:', err.message);
    if (err.requestId) console.error('   Request ID:', err.requestId);
  }
});
