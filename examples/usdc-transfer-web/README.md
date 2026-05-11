# USDC Transfer Web Example

**A zero-gas payment onboarding flow built with Grat and React.**

[Live Demo](https://grat-usdc-transfer-web.vercel.app/)

## Overview

A payment app demonstration built with Grat, where users can send dollars to each other seamlessly. This demo proves that Grat makes blockchain infrastructure entirely invisible to the end user.

## What's happening?

To the user, this is just a modern payment app. Behind the scenes, however, every action is powered by the Stellar network and the Grat protocol:

1.  **Invisible Onboarding**: On app load, the demo silently generates Stellar accounts, funds a master Issuer via Friendbot, creates accounts for Alice, Bob, and Charlie, sets up USDC trustlines, and mints an initial balance for Alice—all in two atomic transactions.
2.  **Sponsored Infrastructure**: All network fees for trustline setup and payments are sponsored by Grat. The user never needs to hold XLM or even know what "gas" is.
3.  **Real-time Settlement**: Transfers happen in seconds with finality. You can instantly switch between Alice, Bob, and Charlie to see live, synchronized balances and activity feeds.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- Grat Relay running locally (run `docker-compose up` in the root directory)

## How to run

1.  Install dependencies:
    ```bash
    pnpm install
    ```
2.  Start the development server:
    ```bash
    pnpm dev
    ```
3.  Open [http://localhost:5173](http://localhost:5173) in your browser.

## Developer View

While the user interface remains clean and free of technical jargon, developers can toggle the **"Developer View"** in the bottom right corner. This panel provides proof of work, showing:
- Total transactions sponsored by Grat.
- Total network fees (in stroops) paid by Grat.
- Real-time transaction hashes with links to the Stellar Expert explorer.

## Documentation

For more details on how to build invisible blockchain experiences, visit [grat.network](https://grat.network).
