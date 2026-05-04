# Grat Relay Server

The high-performance gas abstraction relay for Stellar. It handles transaction sponsorship, channel pool management, and atomic sequence tracking.

[![Documentation](https://img.shields.io/badge/docs-Mintlify-indigo)](https://grat.mintlify.app/docs/introduction)

## Features
- **Transaction Sponsorship**: Native Stellar fee-bump support.
- **Concurrency**: Managed pool of channel accounts to prevent sequence bottlenecks.
- **Reliability**: Redis-backed distributed locking and sequence synchronization.
- **Diagnostics**: Granular drilling into inner transaction failures.

## Quick Start
1. Configure `.env` with `STELLAR_FUNDING_SECRET`.
2. Run via Docker: `docker-compose up -d`.

For full configuration and self-hosting guides, visit the [Official Documentation](https://grat.mintlify.app/docs/self-hosting).

## License
Apache 2.0
