import { Grat } from '../packages/sdk/dist/index.js';
import { 
  Keypair, 
  TransactionBuilder, 
  Networks, 
  rpc, 
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
  console.log(`${COLORS.bold}${COLORS.cyan}🧪 Testing Protocol 26 Fee Estimation (RPC Mode)...${COLORS.reset}\n`);

  const grat = Grat.testnet('http://127.0.0.1:45678');
  const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');
  const user = Keypair.random();
  
  console.log(`${COLORS.cyan}i Creating test account: ${user.publicKey()}...${COLORS.reset}`);
  const fbResponse = await fetch(`https://friendbot.stellar.org/?addr=${user.publicKey()}`);
  if (!fbResponse.ok) {
      throw new Error('Friendbot failed to fund account');
  }
  
  let userAccount;
  for (let i = 0; i < 5; i++) {
      try {
          userAccount = await rpcServer.getAccount(user.publicKey());
          break;
      } catch (e) {
          await new Promise(r => setTimeout(r, 2000));
      }
  }
  
  if (!userAccount) throw new Error('Account creation timed out');

  const contractId = Asset.native().contractId(Networks.TESTNET);
  const contract = new Contract(contractId);

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

  console.log(`${COLORS.cyan}i Simulating via Grat...${COLORS.reset}`);
  const sim = await grat.simulate(tx);
  console.log(`${COLORS.green}✓ Simulation success. Resource Fee: ${sim.resourceFee} stroops${COLORS.reset}`);

  console.log(`${COLORS.cyan}i Estimating via Grat...${COLORS.reset}`);
  const est = await grat.estimate(tx);
  console.log(`${COLORS.green}✓ Estimate: ${est.estimatedFee} stroops${COLORS.reset}`);

  userAccount = await rpcServer.getAccount(user.publicKey());
  const finalTx = new TransactionBuilder(userAccount, {
    fee: est.estimatedFee,
    networkPassphrase: Networks.TESTNET
  })
  .setSorobanData(xdr.SorobanTransactionData.fromXDR(sim.transactionData, 'base64'))
  .addOperation(op)
  .setTimeout(30)
  .build();

  finalTx.sign(user);

  console.log(`${COLORS.cyan}i Sponsoring via Grat...${COLORS.reset}`);
  const result = await grat.sponsor(finalTx);
  console.log(`${COLORS.green}✓ Sponsored! Hash: ${result.hash}${COLORS.reset}`);

  console.log(`${COLORS.cyan}i Waiting for ingestion...${COLORS.reset}`);
  let txData;
  for (let i = 0; i < 10; i++) {
      try {
          txData = await rpcServer.getTransaction(result.hash);
          if (txData.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
            break;
          }
      } catch (e) {
          await new Promise(r => setTimeout(r, 2000));
      }
  }

  if (!txData || txData.status === rpc.Api.GetTransactionStatus.NOT_FOUND) throw new Error('Transaction ingestion timed out');
  
  // Note: RPC resultMetaXdr can be parsed to find actual fee, 
  // but for a simple smoke test, just verifying inclusion is enough.
  console.log(`\n${COLORS.bold}Results:${COLORS.reset}`);
  console.log(`- Simulated Resource Fee: ${sim.resourceFee}`);
  console.log(`- Estimated Total Fee:   ${est.estimatedFee}`);
  console.log(`${COLORS.green}✓ Transaction verified on RPC${COLORS.reset}`);
}

runTest().catch(err => {
    console.error(`\n${COLORS.red}${COLORS.bold}Test Failed!${COLORS.reset}`);
    console.error(`${COLORS.red}Error: ${err.message}${COLORS.reset}`);
    if (err.details) {
        console.error('Details:', JSON.stringify(err.details, null, 2));
    }
    process.exit(1);
});
