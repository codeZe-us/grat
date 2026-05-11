import { Keypair, Asset, Operation, TransactionBuilder, Networks, Account } from '@stellar/stellar-sdk';
import { Grat, FrozenEntryError } from '@grat-official-sdk/sdk';

async function run() {
  console.log('🚀 Starting USDC Transfer Example with Fee Sponsorship');
  
  const grat = Grat.testnet();
  const issuer = Keypair.random();
  const usdc = new Asset('USDC', issuer.publicKey());

  const alice = Keypair.random();
  const bob = Keypair.random();

  console.log(`\nAccounts:\n  Alice: ${alice.publicKey()}\n  Bob:   ${bob.publicKey()}`);

  await Promise.all([
    fetch(`https://friendbot.stellar.org/?addr=${alice.publicKey()}`),
    fetch(`https://friendbot.stellar.org/?addr=${bob.publicKey()}`),
    fetch(`https://friendbot.stellar.org/?addr=${issuer.publicKey()}`)
  ]);
  
  async function getAccountInfo(publicKey: string): Promise<any> {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}`);
      if (res.ok) return res.json();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error(`Failed to fetch account info for ${publicKey} after 10 attempts`);
  }

  console.log('\n--- TRUSTLINE SETUP ---');
  const aliceInfo = await getAccountInfo(alice.publicKey());
  const trustlineTx = new TransactionBuilder(
    new Account(alice.publicKey(), aliceInfo.sequence),
    { fee: '100', networkPassphrase: Networks.TESTNET }
  )
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(30)
    .build();

  trustlineTx.sign(alice);

  const trustlineResult = await grat.sponsor(trustlineTx);
  console.log(`✅ Alice Trustline: ${trustlineResult.hash}`);

  console.log('\n--- BOB TRUSTLINE SETUP ---');
  const bobInfo = await getAccountInfo(bob.publicKey());
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
  const issuerInfo = await getAccountInfo(issuer.publicKey());
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
  const aliceInfo2 = await getAccountInfo(alice.publicKey());
  
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
