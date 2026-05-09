import { Keypair, Asset, Operation, TransactionBuilder, Networks, Account } from '@stellar/stellar-sdk';
import { Grat, FrozenEntryError } from '@grat-official-sdk/sdk';

async function run() {
  console.log('🚀 Starting Trustline Setup Example (Zero-Fee Onboarding)');
  
  const grat = Grat.testnet();
  const issuerAddress = 'GAIQ6QF3JKJYXE756IQAITKOWQ5ZDK2YKX7ZYSQKOI5LMG3NHJ4DY5MN';
  const usdc = new Asset('USDC', issuerAddress);

  const newUser = Keypair.random();
  console.log(`\nNew User: ${newUser.publicKey()}`);
  
  console.log('Funding accounts via Friendbot...');
  await Promise.all([
    fetch(`https://friendbot.stellar.org/?addr=${newUser.publicKey()}`),
    fetch(`https://friendbot.stellar.org/?addr=${issuerAddress}`)
  ]);
  console.log('Waiting for network sync (polling Horizon)...');
  
  async function getAccountInfo(publicKey: string): Promise<any> {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}`);
      if (res.ok) return res.json();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error(`Failed to fetch account info for ${publicKey} after 10 attempts`);
  }

  console.log('\nEstablishing USDC trustline...');
  const info = await getAccountInfo(newUser.publicKey());
  
  const tx = new TransactionBuilder(
    new Account(newUser.publicKey(), info.sequence),
    { 
      fee: '100', 
      networkPassphrase: Networks.TESTNET 
    }
  )
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(30)
    .build();

  tx.sign(newUser);

  console.log('Sending transaction to Grat Relay for sponsorship...');
  try {
    const result = await grat.sponsor(tx);
    
    console.log(`\n✅ Trustline Established!`);
    console.log(`   Transaction Hash: ${result.hash}`);
    console.log(`   Fee Payer (Channel): ${result.channelAccount}`);
  } catch (err: any) {
    if (err instanceof FrozenEntryError) {
      console.error('\n❌ Action Restricted: One or more ledger entries are currently frozen by the network.');
    } else {
      console.error('\n❌ Sponsorship failed:', err.message);
    }
  }
}

run().catch(console.error);
