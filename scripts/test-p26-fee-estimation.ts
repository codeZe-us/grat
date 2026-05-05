import { Grat } from '../packages/sdk/dist/index.js';
import { 
  Keypair, 
  TransactionBuilder, 
  Networks, 
  Horizon, 
  Contract, 
  nativeToScVal, 
  xdr,
  Asset
} from '@stellar/stellar-sdk';

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  bold: "\x1b[1m",
};

async function runTest() {
  console.log(`${COLORS.bold}${COLORS.cyan}🧪 Testing Protocol 26 Fee Estimation...${COLORS.reset}\n`);

  const grat = Grat.testnet('http://127.0.0.1:45678');
  const horizon = new Horizon.Server('https://horizon-testnet.stellar.org');
  const user = Keypair.random();
  
  console.log(`${COLORS.cyan}i Creating test account: ${user.publicKey()}...${COLORS.reset}`);
  const fbResponse = await fetch(`https://friendbot.stellar.org/?addr=${user.publicKey()}`);
  if (!fbResponse.ok) {
      throw new Error('Friendbot failed to fund account');
  }
  
  // Wait for account to be created
  let userAccount;
  for (let i = 0; i < 5; i++) {
      try {
          userAccount = await horizon.loadAccount(user.publicKey());
          break;
      } catch (e) {
          await new Promise(r => setTimeout(r, 2000));
      }
  }
  
  if (!userAccount) throw new Error('Account creation timed out');

  // Native Token Contract on Testnet
  const contractId = Asset.native().contractId(Networks.TESTNET);
  const contract = new Contract(contractId);

  // Simple transfer call to native token
  // balance(id: Address) -> i128 (Read-only is easier to test without needing tokens)
  const op = contract.call('balance', 
    nativeToScVal(user.publicKey(), { type: 'address' })
  );

  const tx = new TransactionBuilder(userAccount, {
    fee: '100',
    networkPassphrase: Networks.TESTNET
  })
  .addOperation(op)
  .setTimeout(30)
  .build();

  // 1. Simulate via Grat
  console.log(`${COLORS.cyan}i Simulating via Grat...${COLORS.reset}`);
  const sim = await grat.simulate(tx);
  console.log(`${COLORS.green}✓ Simulation success. Resource Fee: ${sim.resourceFee} stroops${COLORS.reset}`);

  // 2. Estimate via Grat
  console.log(`${COLORS.cyan}i Estimating via Grat...${COLORS.reset}`);
  const est = await grat.estimate(tx);
  console.log(`${COLORS.green}✓ Estimate: ${est.estimatedFee} stroops${COLORS.reset}`);

  // Update transaction with simulation results
  userAccount = await horizon.loadAccount(user.publicKey());
  const finalTx = new TransactionBuilder(userAccount, {
    fee: est.estimatedFee,
    networkPassphrase: Networks.TESTNET
  })
  .setSorobanData(xdr.SorobanTransactionData.fromXDR(sim.transactionData, 'base64'))
  .addOperation(op)
  .setTimeout(30)
  .build();

  finalTx.sign(user);

  // 3. Sponsor via Grat
  console.log(`${COLORS.cyan}i Sponsoring via Grat...${COLORS.reset}`);
  const result = await grat.sponsor(finalTx);
  console.log(`${COLORS.green}✓ Sponsored! Hash: ${result.hash}${COLORS.reset}`);

  // 4. Verify on-chain
  console.log(`${COLORS.cyan}i Waiting for ingestion...${COLORS.reset}`);
  let txData;
  for (let i = 0; i < 10; i++) {
      try {
          txData = await horizon.transactions().transaction(result.hash).call();
          break;
      } catch (e) {
          await new Promise(r => setTimeout(r, 2000));
      }
  }

  if (!txData) throw new Error('Transaction ingestion timed out');
  
  const actualFee = txData.fee_charged;
  const delta = BigInt(actualFee) - BigInt(est.estimatedFee);

  console.log(`\n${COLORS.bold}Results:${COLORS.reset}`);
  console.log(`- Simulated Resource Fee: ${sim.resourceFee}`);
  console.log(`- Estimated Total Fee:   ${est.estimatedFee}`);
  console.log(`- Actual Fee Charged:    ${actualFee}`);
  console.log(`- Delta:                 ${delta}`);

  if (delta > 0n) {
     console.log(`${COLORS.yellow}⚠ Actual fee exceeded estimate by ${delta} stroops${COLORS.reset}`);
  } else {
     console.log(`${COLORS.green}✓ Actual fee within estimate${COLORS.reset}`);
  }
}

runTest().catch(err => {
    console.error(`\n${COLORS.red}${COLORS.bold}Test Failed!${COLORS.reset}`);
    console.error(`${COLORS.red}Error: ${err.message}${COLORS.reset}`);
    if (err.details) {
        console.error('Details:', JSON.stringify(err.details, null, 2));
    }
    process.exit(1);
});
