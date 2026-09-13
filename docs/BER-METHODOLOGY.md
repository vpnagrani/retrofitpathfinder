# BER comparison MVP — 11 September 2026

Current certificate rating and date are preserved as issued. Each scenario shows an illustrative 2026-scale range only with a confirmed, current primary-energy baseline and adequate dwelling/safety evidence. Legacy certificates require updated assessment; the application does not equate relabelling with improvement. A0 is never predicted.

The model is a sensitivity illustration, not DEAP or a validated energy forecast. Its explicit Pathfinder coefficients are not SEAI savings factors. The cautious end includes no improvement and 5% additional energy use; real outcomes may lie outside the range. Assessment and ventilation costs are provisional allowances requiring itemised quotations.

Certificate PDFs are limited to 5 MB and 5 pages, parsed locally in a bounded child process. Original PDFs, full text and document digests are not retained or sent to AI. Scanned/protected/ambiguous files require manual entry; advisory reports are excluded. Only the homeowner may confirm baseline fields through the revision-controlled BER endpoint. Relevant dwelling edits invalidate potential estimates until review. Confirmed fields and report snapshots follow existing retention/deletion controls.

Three dated SEAI BER summaries augment the source library. Automated refresh returned HTTP 403 on 11 September; previous reviewed summaries were retained, without claiming a successful scrape. Live OpenAI and embeddings still require the API key. MPRN lookup remains synthetic; no live SEAI certificate API integration is claimed.

BER source changes set a separate ber_review_required flag. Grant review cannot release it. An administrator must inspect active BER snapshots, review/update server/ber-potential.js thresholds, assumptions and method version, test and deploy any changes, then POST /api/admin/sources/ber-review with confirm:true and the deployed methodVersion. The review is audited with source digests. This maintenance endpoint requires an authenticated administrator and same-origin protection. Source freshness alone does not clear pending methodology review.

Verification: 52 automated tests pass, including PDF extraction, baseline ownership, revision/fingerprint invalidation, source review separation and existing privacy/retention checks. Browser manual confirmation and report creation exercised; eight-page saved demo PDF visually inspected. Upload parser exercised with real PDF fixtures through the API; no browser file-picker test or scanned-image OCR is claimed.

## SEAI median defaults and assessment support — 11 September 2026

Exact dwelling-type SEAI 2025 medians now replace assumed ±20% costs. No automatic contingency is added. Unmatched assessments, ventilation, moisture repairs and optimisation use null prices rendered as Quote required; they are excluded from explicitly partial subtotals. Budget fit cannot be confirmed until those items are quoted. Current conditional upgrade grants remain separate from historical dataset grant columns.

The €350 registered-OSS Home Energy Assessment grant is shown separately, with once-per-property eligibility and upfront deduction explained. No assessment price is invented; SEAI's €600/€350/€250 example is identified as an example rather than a median. This grant is not added to upgrade support totals or subtracted from whole-package OSS medians. Standard BER and specialist survey scopes are distinguished.

Verification: 53 tests pass, funding page inspected in the browser, and the updated eight-page contractor PDF rendered and checked. Existing saved PDFs remain immutable snapshots; generate a new brief to use the revised figures.

## Applicant type, legacy BER and route arithmetic — 11 September 2026

Profiles now ask applicant type (private owner/landlord, AHB representative, tenant, or unknown) and whether the AHB has valid AHBRA registration. Existing user profiles are not silently classified. Registration is reported, not independently verified. Unconfirmed applicant/registration, grant history or MPRN/permissions leave applicable grants and net costs unresolved; separately displayed published rates are not eligibility decisions. AHB BEH uses standard rates with prior-authorisation requirements. Higher AHB rates apply to OSS only.

Both BEH and OSS tables show median cost reference, conditional grant and net if approved. Net is floored at zero per measure, and no difference is transferred across measures. OSS measure costs explicitly reuse BEH historical medians for comparison, because an OSS per-measure median is not available here; they are not presented as OSS prices. Separate links identify cost and grant sources. The private-home OSS package benchmark displays works median minus historical grant median as a calculated net, with SEAI's independently reported homeowner median separately explained. AHBs are directed to package quotations rather than assigned private-home OSS medians.

Legacy labels such as C3 and D2 are accepted in profile and certificate review, preserved exactly, and not converted automatically. A legacy-only baseline requires an updated assessment before new-scale potential is shown.

Independent review led to aligned summary/applicant gates, null net amounts for unresolved eligibility, and separate median-source links. Verification: 59 full-suite tests passed, followed by focused cost tests after the final source-withholding refinement; profile form and tables inspected in browser, 11-page generated report visually checked. Earlier saved reports retain their original snapshots.
