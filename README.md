# Grat: Stellar Fee-Sponsorship Relay

**Eliminate the "XLM for Gas" problem and onboard users to Stellar with zero friction.**

[![npm version](https://img.shields.io/npm/v/@grat-official-sdk/sdk?label=%40grat-official-sdk%2Fsdk&color=blue)](https://www.npmjs.com/package/@grat-official-sdk/sdk)

## What is Grat?

Stellar transactions require XLM to pay for network fees. For many users, especially those only interested in stablecoins (like USDC), acquiring XLM is a high-friction barrier to entry.

**Grat** is a relay server and SDK that implements **Gas Abstraction**. It allows developers to sponsor the transaction fees for their users by wrapping transactions in fee-bump envelopes. With Grat, your users can hold USDC and perform operations without ever needing to touch or even know about XLM.

---

## Quick Start

### 1. Start the Relay (Docker)

Clone the repo and start the local stack in under 2 minutes:

```bash
git clone https://github.com/codeze-us/grat.git
cd grat
cp .env.example .env
# Open .env and add your STELLAR_FUNDING_SECRET (get one at https://laboratory.stellar.org)
docker-compose up -d
```

### 2. Install the SDK

```bash
npm install @grat-official-sdk/sdk
```

### 3. Sponsor a Transaction

```typescript
import { Grat } from '@grat-official-sdk/sdk';

const grat = Grat.testnet(); // Defaults to http://localhost:3000
const result = await grat.sponsor(signedUserTransaction);

console.log(`Success! Sponsored Hash: ${result.hash}`);
```

---

## How It Works

Grat leverages Stellar's native **Fee-Bump Transactions (CAP-0015)**.

1. The user signs a standard transaction (the "inner" transaction).
2. The SDK sends this to the Grat Relay.
3. The Relay selects an available **Channel Account** from a pre-funded pool.
4. The Relay wraps the inner transaction in a Fee-Bump envelope, signs it with the channel account, and submits it to the network.
5. **Deep Error Diagnostics**: If a transaction fails, Grat drills down into the inner results to expose the exact operation error (e.g., `op_low_reserve`, `op_no_issuer`), saving developers hours of debugging.
6. **Redis-backed sequence management** ensures high concurrency without sequence conflicts across multiple instances.

---

## SDK Reference

### `Grat` Client

| Method         | Description                                                                     |
| :------------- | :------------------------------------------------------------------------------ |
| `sponsor(tx)`  | Wraps a signed transaction and submits it. Returns `{ hash, ledger, feePaid }`. |
| `simulate(tx)` | Performs Soroban simulation via the relay to return resource estimates.         |
| `estimate(tx)` | Predicts the total fee (inclusion + resource) for a transaction.                |
| `status()`     | Returns relay health, network info, and channel pool statistics.                |

---

## API Reference

### `POST /v1/sponsor`

Sponsor a classic or Soroban transaction.

- **Body**: `{ "transaction": "BASE64_XDR", "network": "testnet" }`
- **Headers**: `X-Idempotency-Key` (Optional, recommended)
- **Response**: `200 OK` with `SponsorResponse` object.

### `POST /v1/simulate`

Simulate a Soroban transaction to get execution footprints and resource costs. Works for both classic and Soroban transactions (classic returns zero costs).

- **Body**: `{ "transaction": "BASE64_XDR" }`

---

## Self-Hosting

Grat is designed to be horizontally scalable and production-ready.

### Environment Variables

- `STELLAR_FUNDING_SECRET`: Master key to fund the channel pool.
- `CHANNEL_COUNT`: Number of accounts in the pool (e.g., 50).
- `REDIS_URL`: Required for distributed locking and atomic sequence tracking.
- `NETWORK`: `testnet` or `mainnet`.

---

## Examples (Verified Phase 1)

Explore the `examples/` directory for production-ready blueprints:

- **[USDC Transfer](examples/usdc-transfer)**: Complete lifecycle (Trustline -> Mint -> Payment) with zero XLM fees.
- **[Soroban Call](examples/soroban-contract-call)**: Sponsor smart contract interactions and Soroban resource fees.
- **[Trustline Setup](examples/trustline-setup)**: One-click onboarding for new Stellar users.

---

## Running Tests

```bash
pnpm install
pnpm test:unit         # Run SDK unit tests
pnpm test:integration  # Run Server integration tests against testnet
pnpm smoke-test        # Run end-to-end network validation
```

---

## Phase 1 Status: [Stable & Verified]

Grat has completed its Phase 1 milestone. All core gas-abstraction features for both Stellar Classic and Soroban are implemented, tested, and verified on Testnet.

- [x] Classic Transaction Sponsorship
- [x] Soroban Resource Fee Sponsorship
- [x] Distributed Sequence Management
- [x] High-Concurrency Channel Pool
- [x] Deep Error Diagnostics
- [x] Multi-platform SDK (TypeScript)

---

## Roadmap

---

## Contributing

We welcome contributions! Please check the [Contributing Guide](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Apache 2.0 © [CodeZeus](https://github.com/codeze-us)
