# Security policy

## Reporting a vulnerability

Do not open a public issue containing credentials, personal data or exploit details. Contact the repository owner privately through their verified GitHub profile and include the affected component, reproduction steps, impact and any suggested mitigation.

This prototype does not operate a public vulnerability-reward programme or guarantee a response time.

## Supported version

Only the current `main` branch is maintained during the MVP stage.

## Security and privacy boundary

The repository includes application controls, but it has not completed an independent penetration test or regulatory compliance certification. Before onboarding real homeowners, operators must review identity recovery, MFA, secrets, logging, processor agreements, privacy notices, backups, deletion replay, incident response and network access.

Never commit `.env`, API keys, database files, exported homeowner reports or production data. Use Secret Manager for deployed credentials. Run demonstrations with synthetic data unless the operator has an approved lawful process for real data.

See [architecture and governance](docs/ARCHITECTURE.md) for the access model, retention semantics and data sent outside the application.
