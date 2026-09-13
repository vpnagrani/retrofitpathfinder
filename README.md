# Retrofit Pathfinder

An Ireland-only homeowner retrofit MVP, with an SEAI-inspired interface and distinct branding. Homeowners record a dwelling profile, interview an OpenAI-powered guide, compare three dependency-aware scenarios, and save versioned contractor PDF briefs.

See [the September funding and BER update](docs/UPGRADE-2026-09-10.md) for current cost methodology, funding routes, apartment support and synthetic BER limits. Existing saved PDFs remain unchanged; generate a new version for the updated figures.

## Project status

This repository contains a working local MVP and Google Cloud deployment scaffolding. It has not been deployed from this workspace and has not completed a production security review, qualified retrofit-rule review or live homeowner pilot. See [project status and roadmap](docs/ROADMAP.md).

## Documentation

- [Demo guide](docs/DEMO.md)
- [Architecture and governance](docs/ARCHITECTURE.md)
- [Evidence, costs and boundaries](docs/EVIDENCE.md)
- [BER methodology](docs/BER-METHODOLOGY.md)
- [Google Cloud deployment](docs/DEPLOYMENT.md)
- [Acceptance checks](docs/ACCEPTANCE.md)
- [Security reporting and operational limits](SECURITY.md)
- [Tech Ireland pitch deck](docs/pitch/Retrofit-Pathfinder-Tech-Ireland-Visual.pptx)

## Run locally

Requires Node.js 24+ and pnpm 11.19.0 (or npm).

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm start
```

On Windows use `Copy-Item .env.example .env`. Open **http://localhost:3000**. Choose “Explore example homes” on the public landing page to enter the local preview with two synthetic homes. Use **Preview governance** to inspect the administrator experience. Real API calls require an OpenAI API key in `.env`; restart after changing environment variables. Never paste keys into chat or commit them.

This workstation's bundled pnpm can also be invoked with:

```powershell
& 'C:/Users/WELCOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' start
```

## What works

- Persistent home profiles, manual structured interview and scenario selection.
- OpenAI Responses integration with a strict output schema, bounded context, per-user quotas, consent and homeowner confirmation before applying inferred updates.
- Three scenarios with dependency validation, safety prerequisites, exact published medians where available, quote-required gaps and conditional grant calculations.
- Actual PDFs saved as immutable versions, protected by the same account permissions as each home.
- Invitation-only password accounts; homeowner, assigned-adviser and administrator permissions; secure cookie sessions and origin checks.
- Administrator invitations, adviser assignments, configurable profile/audit retention, deletion requests, deletion fulfilment and audit events.
- Allowlisted SEAI sources, bounded HTML parsing, versioned snapshots, SHA-256 fingerprints, semantic embeddings and PostgreSQL pgvector search. Keyword retrieval works when embeddings are unavailable.
- Scheduled Cloud Run jobs for source refresh and retention, with deployment configuration for project `retrofitpathfinder`.

## Honest operating states

The repository includes manually checked SEAI summaries dated **9 September 2026**, not fabricated scraped pages. Direct HTTP retrieval from this workstation received **403 Forbidden** from SEAI. The app retains its previous evidence and records refresh failure; it does not bypass the website's access controls. Validate retrieval from the deployment network or obtain an authorised feed before relying on unattended refresh.

No OpenAI key was supplied in the build environment. The API contract is covered by mocked tests; live interviews and embeddings still need a credentialed smoke test. The Google Cloud CLI and project authentication were not available, so no cloud resources have been created or charged by this build.

## Storage

Local preview uses Node's SQLite database at `data/pathfinder.sqlite`; embedding vectors use an exact cosine scan for the small local corpus. Google Cloud uses PostgreSQL with **pgvector(1536)** and an HNSW cosine index. Configure `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` or a development `DATABASE_URL`.

Profiles, transcripts, audit metadata, invitations, source snapshots and PDF bytes live in the database. PDF bytes are base64 encoded in PostgreSQL for a small MVP, so deletion is transactional with its home profile; migrate to a private object store at larger scale. Only public SEAI text is embedded. There is no hosted model or vector index pretending to be live when the key is absent.

## Checks

```sh
pnpm test
node server/jobs.js sources
node server/jobs.js retention
```

The automated suite verifies permissions, invitations, replay protection, concurrency checks, grant gates, dependency ordering, source versioning, retrieval, AI request shape, PDF persistence and retention/deletion cascades. Tests create disposable in-memory local data. Do not point the test process at a production database. The example PDF in `output/pdf/` is generated by the test suite and excluded from Git.

## Deployment and operating notes

See [Google Cloud deployment](docs/DEPLOYMENT.md), [architecture and controls](docs/ARCHITECTURE.md), [evidence and costing](docs/EVIDENCE.md) and [acceptance checks](docs/ACCEPTANCE.md).

This is a governed MVP, not a technical assessment or a certification of regulatory compliance. Before public onboarding, complete the operator privacy notice, processor agreements, retention/backup approval, security review, account recovery process, and a qualified review of the retrofit rules and price allowances.

## Contributors

Built through participation in the AI national challenge by Vinay Nagrani, David Bodiu and George Sterpu.

## Licence

No open-source licence has been granted. Copyright remains with the contributors unless they agree otherwise.
