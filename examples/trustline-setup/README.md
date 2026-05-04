# Example: Zero-Fee Trustline Onboarding

This example shows how a new user can establish a trustline for an asset (like USDC) without needing to hold extra XLM for transaction fees.

## Real-world scenario
A wallet wants to onboard a user who only cares about USDC. While the user still needs a small amount of XLM for the network's base reserve, the wallet (via Grat) can sponsor all transaction fees so the user's XLM balance never decreases due to fees.

## What this does
1. Creates a new Stellar account.
2. Builds a `changeTrust` operation to enable USDC.
3. Uses the Grat SDK to sponsor the transaction fee.

## How to run
1. Ensure your local relay is running (`docker-compose up`).
2. `pnpm install`
3. `npm start`
