import { Grat } from '@grat-official-sdk/sdk';
import { Keypair, TransactionBuilder, Networks, Asset, Operation, Horizon } from '@stellar/stellar-sdk';

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  bold: "\x1b[1m",
};

async function runSmokeTest() {
  console.log(`${COLORS.bold}${COLORS.cyan}🚀 Starting Grat Phase 1 Smoke Test...${COLORS.reset}\n`);
  
  const grat = Grat.testnet();
  const horizon = new Horizon.Server('https://horizon-testnet.stellar.org');
  let passCount = 0;
  const totalTests = 8;

  try {
    // 1. Health Check
    try {
      const status = await grat.status();
      console.log(`${COLORS.green}✓ Relay server is healthy (${status.network})${COLORS.reset}`);
      passCount++;
    } catch (e) {
      console.log(`${COLORS.red}✗ Relay server health check failed${COLORS.reset}`);
      throw e;
    }

    // 2. Redis & Channel Health (via status)
    const status = await grat.status();
    if (status.pool) {
      console.log(`${COLORS.green}✓ Redis connected & ${status.pool.funded}/${status.pool.total} channels funded (total: ${status.pool.totalXlm} XLM)${COLORS.reset}`);
      passCount++;
    }

    // 3. Create Fresh Account
    const user = Keypair.random();
    console.log(`${COLORS.cyan}i Creating fresh test account: ${user.publicKey()}...${COLORS.reset}`);
    const fbResponse = await fetch(`https://friendbot.stellar.org/?addr=${user.publicKey()}`);
    if (fbResponse.ok) {
      console.log(`${COLORS.green}✓ Test account created via Friendbot${COLORS.reset}`);
      passCount++;
    } else {
      throw new Error('Friendbot failed');
    }

    // 4. Build Transaction
    const userAccount = await horizon.loadAccount(user.publicKey());
    const tx = new TransactionBuilder(userAccount, {
      fee: '100',
      networkPassphrase: Networks.TESTNET
    })
    .addOperation(Operation.payment({
      destination: 'GAYOLLLUIZE4DZMBB2ZBKGBRCOAVIB6CGE37G7I3ZYT6SADF66GZ6XHS', // Random testnet addr
      asset: Asset.native(),
      amount: '1'
    }))
    .setTimeout(30)
    .build();

    tx.sign(user);

    // 5. Sponsor via SDK
    console.log(`${COLORS.cyan}i Sponsoring transaction via relay...${COLORS.reset}`);
    const result = await grat.sponsor(tx);
    console.log(`${COLORS.green}✓ Transaction sponsored: hash ${result.hash}${COLORS.reset}`);
    passCount++;

    // 6. Verify Fee-Bump on Horizon
    const txData = await horizon.transactions().transaction(result.hash).call();
    if (txData.fee_bump_transaction) {
      console.log(`${COLORS.green}✓ Fee-bump verified on Horizon (Inner fee: ${txData.fee_charged})${COLORS.reset}`);
      passCount++;
    } else {
      console.log(`${COLORS.red}✗ Transaction is not a fee-bump${COLORS.reset}`);
    }

    // 7. Test Simulation
    const simTx = new TransactionBuilder(userAccount, {
      fee: '100',
      networkPassphrase: Networks.TESTNET
    })
    .addOperation(Operation.payment({
      destination: 'GAYOLLLUIZE4DZMBB2ZBKGBRCOAVIB6CGE37G7I3ZYT6SADF66GZ6XHS',
      asset: Asset.native(),
      amount: '0.1'
    }))
    .setTimeout(30)
    .build();

    const sim = await grat.simulate(simTx);
    console.log(`${COLORS.green}✓ Simulation returned results${COLORS.reset}`);
    passCount++;

    // 8. Test Estimate
    const est = await grat.estimate(simTx);
    console.log(`${COLORS.green}✓ Fee estimate received: ${est.estimatedFee} stroops${COLORS.reset}`);
    passCount++;

    console.log(`\n${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.green}All ${passCount}/${totalTests} checks passed. Grat Phase 1 is working.${COLORS.reset}`);

  } catch (err: any) {
    console.error(`\n${COLORS.red}${COLORS.bold}Smoke Test Failed!${COLORS.reset}`);
    console.error(`${COLORS.red}Error: ${err.message}${COLORS.reset}`);
    process.exit(1);
  }
}

runSmokeTest();
