# Security boundary

Pactlane Keeper is testnet-only.

The keeper is intentionally narrow:

- verifies Base Sepolia chain ID 84532 before acting;
- reads only Pactlane Escrow V2 state;
- submits only `releaseAfterReviewPeriod(uint256)`;
- never changes agreement terms;
- never resolves disputes;
- never transfers arbitrary escrow funds;
- never accesses buyer or seller wallets;
- re-checks agreement and milestone state immediately before sending;
- defaults to dry-run mode;
- requires a dedicated keeper key for live testnet execution.

Do not reuse the Pactlane owner wallet, recovery phrase, or private key.

Mainnet automation requires an independent smart-contract audit, managed signer/HSM or KMS, monitoring and alerting, rate limiting, treasury policy, and incident-response procedures.
