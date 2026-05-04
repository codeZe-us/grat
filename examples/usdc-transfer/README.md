# Example: USDC Transfer (Sponsored)

This example demonstrates how to use the Grat Relay Server to sponsor fees for "Classic" Stellar transactions, specifically setting up trustlines and sending asset payments.

## What this does
1. Creates two fresh testnet accounts (Alice and Bob) via Friendbot.
2. Establishes a USDC trustline for Alice, sponsored by the relay.
3. Establishes a USDC trustline for Bob, sponsored by the relay.
4. Sends a 50 USDC payment from Alice to Bob, sponsored by the relay.

**Result:** Alice and Bob never pay any XLM for transaction fees.

## Prerequisites
- A running Grat Relay Server (e.g., via `docker-compose up`) at `http://localhost:3000`.

## How to run
1. Install dependencies: `pnpm install`
2. Run the example: `npm start`
