# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-04

### Added
- Initial release of Grat Relay Server.
- TypeScript SDK (`@grat-official-sdk/sdk`) for easy client integration.
- Automated testnet channel funding via Friendbot.
- Redis-backed sequence management for high concurrency.
- Docker and Docker Compose configuration.
- Comprehensive integration and unit testing suites.
- Example projects for USDC transfers, Soroban calls, and trustline setup.
- GitHub Actions CI/CD workflows.
- Bug report and feature request templates.

### Fixed
- Resolved `ReqId` type mismatches in server controllers.
- Corrected `ioredis` set argument order for atomic locks.
- Fixed `TransactionBuilder` type errors in integration tests.
