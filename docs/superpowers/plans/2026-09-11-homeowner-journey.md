# Published grants and homeowner journey

Approved scope: always display published SEAI rates, keep eligibility separate, and simplify the homeowner journey and results.

1. Preserve strict eligibility decisions but add always-visible dated reference rates and illustrative net-at-rate calculations in server/route-costs.js. A published rate is not an approved award. No matching grant is explicitly zero/not covered; unpriced work requires quotation. Tests cover unknown applicant, stale sources, AHB rates, equal-cost zero net and absent prices.
2. Rebuild funding presentation as a concise route comparison, rate table and separate eligibility status. Explain BEH cost references used for OSS. Reuse reference arithmetic consistently in dashboard and PDFs; do not mutate saved snapshots.
3. Add reusable journey navigation and a next-action card. Remove full funding-table repetition from comparison/pathway pages. Group the long home form into clearly named expandable sections, with essentials open and optional screening separate. Keep keyboard accessibility and existing save validation.
4. Run automated regression suite, inspect browser and rendered PDF, review changes, update release/documentation. No deployment or secret configuration in this scope.
