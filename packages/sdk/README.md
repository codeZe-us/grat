<p align="center">
  <img src="../../assets/logo.png" width="80" alt="Grat Logo" />
</p>

# Grat TypeScript SDK

The official client for interacting with the **Grat Relay Server** to enable zero-fee transaction sponsorship on Stellar.

[![npm version](https://img.shields.io/npm/v/@grat-official-sdk/sdk?label=%40grat-official-sdk%2Fsdk&color=blue)](https://www.npmjs.com/package/@grat-official-sdk/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@grat-official-sdk/sdk)](https://www.npmjs.com/package/@grat-official-sdk/sdk)
[![Documentation](https://img.shields.io/badge/docs-Mintlify-indigo)](https://grat.mintlify.app/introduction)

## Installation

```bash
npm install @grat-official-sdk/sdk
# or
pnpm add @grat-official-sdk/sdk
```

## Quick Start

### 1. Initialize the Client

```typescript
import { Grat } from '@grat-official-sdk/sdk';

// Connect to your local relay or the public testnet relay
const grat = Grat.testnet();
```

### 2. Sponsor a Transaction

```typescript
const result = await grat.sponsor(mySignedTransaction);
console.log(`Transaction Sponsored! Hash: ${result.hash}`);
```

## Detailed Usage

### Soroban Smart Contracts

Sponsoring Soroban transactions requires simulation first to determine resource costs.

```typescript
// 1. Simulate
const sim = await grat.simulate(unsignedTx);
console.log(`Resource Fee: ${sim.resourceFee}`);

// 2. Sign and Sponsor
const result = await grat.sponsor(signedTx);
```

### Error Handling

The SDK provides typed errors for precise handling of relay and network failures. Detailed network errors (e.g., `op_low_reserve`) are available in the `message` or `details` property.

```typescript
import { SubmissionFailedError, RateLimitError } from '@grat-official-sdk/sdk';

try {
  await grat.sponsor(tx);
} catch (error) {
  if (error instanceof SubmissionFailedError) {
    console.log(`Stellar Error: ${error.message}`); // e.g., "Transaction Failed: op_low_reserve"
    console.log(error.details); // Full Horizon result codes
  } else if (error instanceof RateLimitError) {
    console.log(`Retry after ${error.retryAfter} seconds`);
  }
}
```

## API Reference

### `Grat.testnet(relayUrl?: string)`

Creates a client for Stellar testnet. Defaults to `http://localhost:3000`.

### `Grat.mainnet(apiKey: string, relayUrl: string)`

Creates a client for Stellar mainnet. **Requires an API key.**

### `client.sponsor(transaction)`

- **Parameters**: `Transaction | FeeBumpTransaction` (Stellar SDK objects)
- **Returns**: `Promise<SponsorResult>`
- **Note**: Automatically handles idempotency and retries.

### `client.simulate(transaction)`

- **Parameters**: `Transaction`
- **Returns**: `Promise<SimulationResult>`

### `client.estimate(transaction)`

- **Parameters**: `Transaction`
- **Returns**: `Promise<EstimateResult>`

## Examples

Check out the **[Examples Directory](https://github.com/gratnetwork/grat/tree/main/examples)** for full project demos including USDC transfers and Soroban contract calls.

## Support & Contact

- **Twitter**: [@gratnetworkHq](https://x.com/gratnetworkHq)
- **Email**: [gratnetworkofficial@gmail.com](mailto:gratnetworkofficial@gmail.com)
- **Docs**: [grat.mintlify.app](https://grat.mintlify.app)

## License

Apache 2.0
