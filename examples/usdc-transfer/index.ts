import { Keypair, Asset, Operation, TransactionBuilder, Networks, Account } from '@stellar/stellar-sdk';
import { Grat } from '@grat/sdk';

async function run() {
  console.log('🚀 Starting USDC Transfer Example with Fee Sponsorship');
  
  const grat = Grat.testnet();
  const issuer = Keypair.random(); // In a real scenario, this would be the USDC issuer
  const usdc = new Asset('USDC', issuer.publicKey());

  // 1. Create Alice and Bob
  const alice = Keypair.random();
  const bob = Keypair.random();

  console.log(`\n1. Creating test accounts...`);
  console.log(`   Alice: ${alice.publicKey()}`);
  console.log(`   Bob:   ${bob.publicKey()}`);

  await fetch(`https://friendbot.stellar.org/?addr=${alice.publicKey()}`);
  await fetch(`https://friendbot.stellar.org/?addr=${bob.publicKey()}`);
  console.log('   ✅ Accounts funded with XLM for base reserve (via Friendbot)');

  // 2. Setup Alice's Trustline (SPONSORED)
  console.log('\n2. Setting up USDC trustline for Alice (SPONSORED)...');
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

  // 3. Setup Bob's Trustline (Alice doesn't pay for this either, but we'll just do it manually for Bob or sponsor it too)
  // For simplicity, let's just sponsor Bob's too.
  console.log('\n3. Setting up USDC trustline for Bob (SPONSORED)...');
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

  // 4. Send USDC from Alice to Bob (SPONSORED)
  console.log('\n4. Alice sending 50 USDC to Bob (SPONSORED)...');
  // Need to get new sequence for Alice
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
  console.error('\n❌ Example failed:', err.message);
  if (err.requestId) console.error('   Request ID:', err.requestId);
});
