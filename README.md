# Pactlane Keeper

Automated Base Sepolia testnet keeper for Pactlane Escrow V2.

## Purpose

This service scans Pactlane Escrow V2 and triggers only the permissionless `releaseAfterReviewPeriod(uint256)` function after the contract's 7-day review window has expired.

- Network: Base Sepolia only
- Chain ID: 84532
- Escrow V2: `0xb9a1fb6655704821861d405c3e1616b4412015f1`
- Schedule: hourly through GitHub Actions
- Default mode: dry run
- Mainnet: disabled

## Safety boundary

The keeper cannot change agreement terms, resolve disputes, withdraw arbitrary escrow funds, access user wallets, or bypass the Escrow V2 contract rules.

Every candidate is re-read from chain immediately before a transaction is submitted.

## Activation

The repository intentionally starts in `DRY_RUN=true`. Live testnet execution requires a dedicated keeper wallet stored only as the GitHub Actions secret `KEEPER_PRIVATE_KEY`. Never use the Pactlane owner wallet seed phrase/private key.

After the dedicated wallet is funded with a small amount of Base Sepolia ETH and the secret is configured, the workflow can be switched from dry-run to live testnet mode.
