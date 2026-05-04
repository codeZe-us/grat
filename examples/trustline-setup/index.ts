import { Keypair, Asset, Operation, TransactionBuilder, Networks, Account } from '@stellar/stellar-sdk';
import { Grat } from '@grat-official-sdk/sdk';

/**
 * Real-world Use Case: Zero-XLM Onboarding
 * 
 * Many users want to use Stellar specifically for stablecoins (like USDC).
 * Usually, a user needs XLM to pay for the 'changeTrust' operation fee.
 * With Grat, a user can establish their trustline with ZERO XLM in their wallet
 * for fees, as long as the relay sponsors the transaction.
 * 
 * Note: The user still needs the base reserve (0.5 XLM) to open the trustline slot,
 * but they don't need XLM for the transaction fee itself.
 */

async function run() {
  console.log('🚀 Starting Trustline Setup Example (Zero-Fee Onboarding)');
  
  const grat = Grat.testnet();
  const usdc = new Asset('USDC', 'GAIQ6QF3JKJYXE756IQAITKOWQ5ZDK2YKX7ZYSQKOI5LMG3NHJ4DY5MN');

  // 1. Create a new user
  const newUser = Keypair.random();
  console.log(`\n1. New User: ${newUser.publicKey()}`);
  
  // We use Friendbot to give them the base reserve (required by the network for state)
  // But we want to demonstrate they don't need extra XLM for fees.
  console.log('   Funding account with base reserve via Friendbot...');
  await fetch(`https://friendbot.stellar.org/?addr=${newUser.publicKey()}`);
  console.log('   Waiting for network sync...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 2. Setup Trustline
  console.log('\n2. Establishing USDC trustline...');
  const info = await (await fetch(`https://horizon-testnet.stellar.org/accounts/${newUser.publicKey()}`)).json();
  
  const tx = new TransactionBuilder(
    new Account(newUser.publicKey(), info.sequence),
    { 
      fee: '100', // This fee will be paid by the Relay, not the User
      networkPassphrase: Networks.TESTNET 
    }
  )
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(30)
    .build();

  // User signs the inner transaction
  tx.sign(newUser);

  // 3. Sponsor via SDK
  console.log('   Sending transaction to Grat Relay for sponsorship...');
  try {
    const result = await grat.sponsor(tx);
    
    console.log(`\n✅ Trustline Established!`);
    console.log(`   Transaction Hash: ${result.hash}`);
    console.log(`   Fee Payer (Channel): ${result.channelAccount}`);
    console.log(`\nSuccess! The user was onboarded to USDC without spending their own XLM on fees.`);
  } catch (err: any) {
    console.error('\n❌ Sponsorship failed:', err.message);
  }
}

run().catch(console.error);
