# Evidence, costs and boundaries

## Reviewed sources

Catalogue date: **9 September 2026**. These are primary SEAI webpages, checked during the build:

- [Attic insulation](https://www.seai.ie/grants/home-energy-grants/individual-grants/attic-insulation)
- [Wall insulation](https://www.seai.ie/grants/home-energy-grants/individual-grants/wall-insulation)
- [Heat pump systems](https://www.seai.ie/grants/home-energy-grants/individual-grants/heat-pump-systems)
- [Solar PV](https://www.seai.ie/grants/home-energy-grants/individual-grants/solar-electricity-grant)

Standard house-type values are encoded in `server/pathway.js`, with short source summaries in `server/catalog.js`. Eligibility checks are intentionally conservative: ownership, MPRN existence, build/occupation dates and reported previous funding are required before showing a non-zero ceiling. The award can still be zero. Heat-pump bundle components and solar capacity must be individually verified. Traditional-wall support, higher welfare/first-time-buyer rates and supplementary wall grants are not automatically counted.

This does not cover every SEAI measure or scheme. Window, door, floor, heating-control, rafter and managed One Stop Shop grant packages need a separate assessment. The app should not add separate programme grants for the same work. A One Stop Shop or Warmer Homes eligibility discussion belongs in the qualified hand-off, not in an invented award calculation.

## Source lifecycle

1. Initially serve the manually checked summaries, explicitly labelled `reviewed-summary`.
2. Fetch only the seven configured official URLs; the runtime records a failed status if access is refused, the response is unsuitable or parsing fails.
3. Strip page chrome and save an immutable source version when the content hash changes. An unchanged page updates `checked_at` without claiming new content.
4. Chunk with overlap and embed the public content; interrupted embedding resumes on the next refresh.
   The administrator can also choose **Index saved evidence** to embed the existing reviewed summaries or cached snapshots without changing their dates or claiming a new scrape. This is useful when the website declines a fresh fetch.
5. A changed page sets `grant_review_required=true`. All numeric support ceilings are withheld until a human checks the fixed catalogue against the new source content.
6. If figures change, edit the catalogue/rules, update the version/date, test and redeploy before recording review. A review button is an attestation, not automatic extraction of new grant amounts. A catalogue older than 90 days also withholds support regardless of that flag.

Source content can contain irrelevant or adversarial text. It is supplied to the AI as untrusted evidence, with no action tools. The deterministic engine owns costs and sequencing; the AI does not execute source instructions. This reduces but does not eliminate LLM answer risks, so explanations remain provisional.

## Cost assumptions

Matched measures use exact SEAI 2025 individual-upgrade medians by dwelling type, checked 10 September 2026. They are not scaled by floor area. Unmatched survey, repair, ventilation and optimisation items have no invented price: the app labels them **Quote required** and excludes them from explicitly partial subtotals. No automatic contingency is added. Confirm VAT, scope, exclusions and contingency in quotations.

For each priced measure, the displayed reference net is `max(0, median cost − applicable published grant)`. Support cannot spill from a cheap measure into unrelated work. Personal eligibility may remain unresolved even while published reference rates are visible, and upfront cash requirements depend on the delivery route.

OSS works, grant and homeowner medians are independently published historical statistics; they are not subtracted. Fully funded screening never promises the selected pathway: SEAI selects and approves suitable works. See [the update methodology](UPGRADE-2026-09-10.md) for sources and scope limits.

## Retrofit gates

Survey → moisture resolution where needed → ventilation/combustion-safety design → appropriate fabric upgrades → verified heat loss, emitters and electrical design → heating installation. Ventilation installation and commissioning must be coordinated with the fabric works. PV can run separately after roof/electrical suitability and roof-work coordination; it is not a heat-pump prerequisite.

Use the PDF as a brief for a competent adviser or registered contractor. It is not a specification, quotation, grant approval, or substitute for on-site assessment.
