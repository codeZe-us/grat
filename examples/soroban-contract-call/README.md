# Example: Soroban Contract Call (Sponsored)

This example demonstrates how to use the Grat Relay Server to simulate and sponsor fees for Soroban smart contract invocations.

## What this does
1. Creates a fresh testnet account.
2. Builds a contract invocation for a "Hello World" contract.
3. Uses the SDK to **simulate** the transaction on the relay (getting resource estimates).
4. Uses the SDK to **sponsor** the final transaction submission.

**Result:** The user performs complex smart contract operations without needing to calculate resource fees or pay XLM for submission.

## Prerequisites
- A running Grat Relay Server at `http://localhost:3000`.
- A valid Soroban contract ID on testnet (the ID in the script is a placeholder).

## How to run
1. Install dependencies: `pnpm install`
2. Run the example: `npm start`
