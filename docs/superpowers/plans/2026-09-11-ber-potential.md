# BER Potential Implementation Plan

> **For agentic workers:** Execute the agreed design with Superpowers test-driven development and verification-before-completion; independent code review before completion.

**Goal:** Preserve the current certificate rating and show a conservative potential range for each existing scenario using the May 2026 scale, only when adequate baseline evidence exists.

**Architecture:** A pure BER module validates dated baselines and calculates explicitly assumed sensitivity ranges. A bounded local PDF parser extracts candidate certificate fields for homeowner review. Existing profile revision control, audit, retention and PDF snapshot mechanisms carry the confirmed baseline and calculated output.

**Tech Stack:** Node 24, Express, Zod, PDF.js text extraction, existing SQLite/PostgreSQL and PDFKit.

**Spec:** User-approved conversation: both PDF upload and manual entry; no advisory reports; current certificate or BER primary-energy figure required; a range per scenario; conservative MVP model rather than full DEAP; abstain when evidence is insufficient. Preserve original rating/date, distinguish scale change from retrofit improvement, retrieve timestamped SEAI sources.

## Constraints

- New thresholds: A <=75, B <=150, C <=225, D <=275, E <=325, F <=375, G >375 kWh/m²/year. A0 <=42 also requires ZEB criteria and will never be predicted by this model.
- Legacy thresholds/date are preserved. Pre-24-May-2026 primary-energy methodology is not automatically recalculated; show assessment needed for new-scale predictions from legacy-only data.
- Model coefficients are prototype sensitivity assumptions, not SEAI-derived savings or certified outcomes; include zero improvement in the conservative bound. No grant approval is inferred from a projected rating.
- Confirmed baseline includes source type, issue/assessment date, primary energy where available, original rating, homeowner confirmation that it describes the current dwelling, and no personal identifiers. Missing, expired, inconsistent or incomplete evidence abstains.
- PDF uploads: application/pdf, <=5 MB, <=5 pages; local extraction in a bounded child process; no PDF/text persistence and no transmission to OpenAI. Scans/password-protected PDFs fall back to manual entry. No advisory-report ingestion.
- Work stays in this already-authorised shared application workspace; no commit/publish operation requested.

## Tasks

- [x] 1. Pure BER model in `server/ber-potential.js` and baseline schema in `server/validation.js`; tests `tests/ber-potential.test.js`. Prove thresholds at 75/150/225/275/325/375, never predict A0, reject bills/expired/legacy/inconsistent baselines, and suppress unsupported scenario measures. Then implement the minimum model.
- [x] 2. Certificate extraction in `server/ber-certificate.js` and isolated worker. Tests create real PDFKit fixtures and assert primary vs final energy separation, ambiguity/scan fallback, date/rating extraction and PDF limits. Route in `server/app.js` requires profile access, origin, quota and no pending deletion, and logs metadata only. Confirmed fields save via an owner-only, revision-controlled BER review endpoint.
- [x] 3. `public/ber-potential.js` provides upload/manual review forms and current/potential cards in overview, pathway and scenario comparison; baseline changes clear if incompatible dwelling facts change. Update old and new rating options and AI schema. UI review required before saving extracted facts.
- [x] 4. Add timestamped SEAI BER scale/methodology sources to the existing retrieval pipeline, retain prior snapshots on failed refresh, and gate model on changed sources. Update `server/pdf.js` to carry baseline, ranges, assumptions, method version and source references. Update documentation and run all tests.
- [x] 5. Independent code review, browser end-to-end review and rendered PDF QA; fix findings and rerun affected/full tests. Leave local preview running and report limitations.

## Verification commands

`node --test tests/ber-potential.test.js` (model boundaries and abstention)

`node --test tests/ber-certificate.test.js` (real generated PDF extraction)

`node --test --test-concurrency=1 tests/*.test.js` (full integration and privacy/retention regressions)

Browser: enter a post-May-2026 D baseline at 260 kWh/m²/year; review three scenarios; upload a generated text certificate and confirm fields; switch to legacy certificate and verify abstention; generate/reopen contractor PDF. Inspect rendered pages for clipping and orphan content.
