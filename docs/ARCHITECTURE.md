# Architecture and governance

## Request path

Browser → same-origin Express application → authenticated permission check → SQLite (local) or Cloud SQL PostgreSQL (cloud).

The interview additionally calls OpenAI Responses with building facts, the last twelve messages, rule-engine output and relevant public source excerpts. Strict JSON output returns conversational text, suggested profile changes and source IDs. Only IDs actually retrieved are accepted as citations. The homeowner reviews changes in the profile form before saving. Structured changes cannot set consent, roles, evidence status or grant calculations.

The source pipeline uses an exact URL allowlist, rejects redirects, caps downloads at 2 MB, times out, strips scripts/navigation and versions extracted content by hash. Each source chunk keeps its source-version ID. OpenAI `text-embedding-3-small` produces 1,536-dimensional vectors. Cloud SQL uses pgvector cosine similarity; the small local SQLite index performs exact cosine similarity in application memory. Until embeddings exist, search is explicitly labelled keyword retrieval.

## Access matrix

| Action | Homeowner | Adviser | Administrator |
|---|---|---|---|
| Create a home | Own profile | No | No |
| Read/edit home and transcript | Own only | Explicitly assigned only | All workspace homes |
| Change AI consent | Own only | No | Only if personally the owner |
| Create/view PDFs | Own homes | Assigned homes | All workspace homes |
| Request/cancel deletion | Own only | No | Only if personally the owner |
| Fulfil deletion | No | No | Only with a pending request |
| Invite, assign, configure retention, review sources | No | No | Yes |

This is one organisation/workspace, not a multi-tenant SaaS product. Administrator access is privileged and must be disclosed to homeowners. Adviser assignment currently requires an administrator to confirm homeowner agreement operationally; an in-app homeowner sharing approval is a future enhancement.

## Identity and application security

- Passwords are salted with a random 32-byte value and hashed with Node scrypt. Invitation tokens and session tokens are 256-bit random secrets stored only as SHA-256 hashes.
- Single-use invitations expire in 72 hours. Sessions expire in eight hours. Production cookies are Secure, HttpOnly and SameSite=Strict.
- Origin checks apply to all state-changing API requests. Helmet sets CSP and common browser headers. HTML text is escaped. API responses are `no-store`.
- Every profile/transcript/report route checks current ownership or adviser assignment, including direct PDF URLs. Removing an assignment immediately removes access.
- API authentication, AI and export quotas use atomic database counters; a process-local broad request limiter is an additional guard.
- Profile updates use revision checks. Source refresh, retention, interviews and report generation use database-backed leases to avoid duplicate work. Leases expire after 30 minutes if the process fails.
- Audit metadata does not contain passwords, API keys, invitation links or transcript bodies. It records event type, opaque actor/target IDs, timestamp and bounded action metadata.
- AI consent changes record whether permission was enabled or withdrawn, the notice version and profile revision in a separate audit event.
- Production refuses to start with local demo access, SQLite or a non-HTTPS configured origin. Demo endpoints are loopback-only and absent outside demo mode.

## Retention semantics

The configurable profile clock is inactivity since `updated_at`; profile edits, completed interviews and generated reports refresh it. Reading a report does not. Defaults are 365 days for inactive homes and 730 days for audit events, subject to operator policy approval.

Retention deletes a home plus its messages and PDF records in a transaction using foreign-key cascades. Homeowners can request deletion sooner; edits and new reports pause while a request is pending. An administrator fulfils it or the homeowner cancels. Audit records retain opaque identifiers and minimal deletion metadata until their own expiry. Public source versions are retained to preserve report provenance and contain no homeowner data.

Credentials/accounts are not automatically removed by profile retention. Operators must handle account erasure/recovery separately in this MVP. Backups require a separate documented expiry and restore process: after a restore, reapply deletion events since the backup before serving traffic. No compliance claim is made from application deletion alone.

## Data sent outside the app

Public SEAI text goes to OpenAI for embeddings. With per-home consent, building facts and interview text go to OpenAI for responses. The home display name is excluded from the structured AI profile, but homeowners may type identifying details into messages; the UI tells them not to. `store:false` is requested; that is not a claim of zero provider retention or EU-only processing. The operator must configure an appropriate OpenAI project and data-processing agreement before real users.

## Deployment boundaries

Cloud Run and Cloud SQL are configured for `europe-west1`, with runtime secrets supplied by Secret Manager and Cloud SQL access through its authenticated Unix socket. No GCS public buckets are needed. Public Cloud Run ingress serves a sign-in page; the data API requires application authentication. Restrict ingress further if piloting only inside one organisation.

Before a public launch, add or integrate managed identity with MFA and recovery, agree controller/processor responsibilities, add operational monitoring and incident procedures, test restore/deletion replay, and independently review authentication and the technical retrofit rules. A local passing suite is not a production penetration test.
