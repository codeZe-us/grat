# Grat TypeScript SDK

The official client for interacting with the **Grat Relay Server** to enable zero-fee transaction sponsorship on Stellar.

## Installation

```bash
npm install @grat/sdk
# or
pnpm add @grat/sdk
```

## Quick Start

### 1. Initialize the Client

```typescript
import { Grat } from '@grat/sdk';

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

The SDK provides typed errors for precise handling of relay and network failures.

```typescript
import { ChannelExhaustedError, RateLimitError } from '@grat/sdk';

try {
  await grat.sponsor(tx);
} catch (error) {
  if (error instanceof ChannelExhaustedError) {
    // Wait for the relay to replenish or try another relay
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

Check out the **[Examples Directory](https://github.com/codeze-us/grat/tree/main/examples)** for full project demos including USDC transfers and Soroban contract calls.

## License

Apache 2.0
