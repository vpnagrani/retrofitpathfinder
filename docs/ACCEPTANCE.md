# MVP acceptance and remaining validation

## Verified locally

- The full automated suite covers sequencing, eligibility gates, catalogue expiry, revision conflicts, account isolation, invitation replay, adviser assignment and revocation, AI consent, missing-key behaviour, PDF versioning, BER certificate extraction, source version changes, retrieval, production startup guards and deletion cascades.
- Browser: homeowner dashboard, contrasting-home selection, profile-form save, scenario comparison and selection, ordered pathway, saved-report creation, document library, interview missing-key state and dated source search.
- PDF: all five pages of the generated example rendered and visually inspected for clipping, overlap, page flow and readable provenance.
- Published SEAI source pages checked through research tools; summaries and numeric catalogue are dated 9 September 2026.
- Direct scraper retrieval attempted with normal network permission and with permission granted; server returned HTTP 403. Failure retains previous source versions.

## Credentialed / deployment checks still required

- A live OpenAI Responses conversation and actual embedding calls. Tests mock the external API and do not prove account/model access.
- Actual PostgreSQL/pgvector integration and cross-instance concurrency on Cloud SQL. The local suite uses SQLite; PostgreSQL syntax and deployment files have not been exercised against a provisioned project.
- Cloud build, deployed authentication, daily Scheduler/Cloud Run job execution, HTTPS cookies and recovery procedures.
- Direct SEAI fetch from the deployment network, or an authorised source feed if SEAI declines automated access.
- Independent competent-person review of retrofit rules and market validation of cost allowances.

## Deliberate MVP limits

Text-based BER certificate PDFs can be parsed locally for homeowner review. The parser does not authenticate certificates, process scanned-image OCR or use advisory reports. The MVP provides no live MPRN lookup, qualified technical verification, certified BER prediction, savings forecast, market-price feed, loan recommendation, universal grant eligibility, payment processing or email delivery. Accounts use password authentication with operator-managed recovery; enterprise SSO/MFA and account-erasure self-service are not yet integrated. Profiles and generated PDFs are saved in the database with role checks; Cloud SQL backups need a separate lifecycle policy.
