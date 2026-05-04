import { Keypair, Asset, Operation, TransactionBuilder, Networks, Horizon } from '@stellar/stellar-sdk';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  const seedPhrase = process.env.CHANNEL_SEED_PHRASE;
  const fundingSecret = process.env.STELLAR_FUNDING_SECRET;
  const count = parseInt(process.argv[2] || process.env.CHANNEL_COUNT || '10', 10);
  const amount = process.argv[3] || '100';

  if (!seedPhrase || !fundingSecret) {
    console.error('Missing CHANNEL_SEED_PHRASE or STELLAR_FUNDING_SECRET');
    process.exit(1);
  }

  const fundingKeypair = Keypair.fromSecret(fundingSecret);
  const horizon = new Horizon.Server('https://horizon-testnet.stellar.org');
  const seed = await bip39.mnemonicToSeed(seedPhrase);

  console.log(`Creating ${count} channels on testnet...`);
  console.log(`Funding source: ${fundingKeypair.publicKey()}`);

  const channelPublicKeys: string[] = [];
  for (let i = 0; i < count; i++) {
    const path = `m/44'/148'/${i}'`;
    const derived = derivePath(path, seed.toString('hex'));
    const keypair = Keypair.fromRawEd25519Seed(derived.key);
    channelPublicKeys.push(keypair.publicKey());
  }

  try {
    const fundingAccount = await horizon.loadAccount(fundingKeypair.publicKey());
    const transaction = new TransactionBuilder(fundingAccount, {
      fee: '10000', // Higher fee for batch creation
      networkPassphrase: Networks.TESTNET,
    });

    for (const publicKey of channelPublicKeys) {
      transaction.addOperation(
        Operation.createAccount({
          destination: publicKey,
          startingBalance: amount,
        })
      );
    }

    const tx = transaction.setTimeout(30).build();
    tx.sign(fundingKeypair);

    console.log('Submitting transaction...');
    const result = await horizon.submitTransaction(tx);
    console.log(`Successfully created ${count} channels! Hash: ${result.hash}`);
  } catch (err: any) {
    console.error('Error creating channels:', err.response?.data || err.message);
    
    if (err.response?.data?.extras?.result_codes?.op_res_codes) {
        console.error('Operation result codes:', err.response.data.extras.result_codes.op_res_codes);
    }
  }
}

run();
