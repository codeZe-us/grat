<p align="center">
  <img src="../../assets/logo.png" width="80" alt="Grat Logo" />
</p>

# Grat Relay Server

The high-performance gas abstraction relay for Stellar. It handles transaction sponsorship, channel pool management, and atomic sequence tracking.

[![Documentation](https://img.shields.io/badge/docs-Mintlify-indigo)](https://grat.mintlify.app/introduction)

## Features
- **Transaction Sponsorship**: Native Stellar fee-bump support.
- **Concurrency**: Managed pool of channel accounts to prevent sequence bottlenecks.
- **Reliability**: Redis-backed distributed locking and sequence synchronization.
- **Diagnostics**: Granular drilling into inner transaction failures.

## Quick Start
1. **Cloud Deployment (Recommended)**: 
   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/gratnetwork/grat)

2. **Manual Setup**:
   - Configure `.env` with `STELLAR_FUNDING_SECRET` and `CHANNEL_SEED_PHRASE`.
   - Run via Docker: `docker-compose up -d`.

For full configuration and self-hosting guides, visit the [Official Documentation](https://grat.mintlify.app/self-hosting).

## Support & Contact

- **Twitter**: [@gratnetworkHq](https://x.com/gratnetworkHq)
- **Email**: [gratnetworkofficial@gmail.com](mailto:gratnetworkofficial@gmail.com)
- **Docs**: [grat.mintlify.app](https://grat.mintlify.app)

## License

Apache 2.0
