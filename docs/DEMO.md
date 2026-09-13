# Demo guide

## Start the local preview

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm start
```

Open `http://localhost:3000`. The example experience is available only when `DEMO_MODE=true` and the request comes from the local machine.

## Suggested five-minute walkthrough

1. Open the landing page and choose **Explore example homes**.
2. Select one of the two synthetic homes.
3. Review dwelling details and applicant type, including the apartment and Approved Housing Body options.
4. Add BER evidence manually, upload a text-based certificate PDF for review, or use a synthetic BER fixture. Explain that no live SEAI MPRN lookup is present.
5. Compare the comfort, heat-pump-readiness and whole-home scenarios.
6. Open **Grants & costs** and compare Individual Energy Upgrades, One Stop Shop and Fully Funded Energy Upgrades.
7. Show median cost, published grant and net-if-approved columns. Explain that quote-required work remains outside partial subtotals.
8. Generate a contractor brief, reopen the saved PDF, and show the assumptions and questions for the contractor.
9. Open the governance preview to show retention, deletion requests, audit events and dated source records.

## Demo boundaries

- Use synthetic homes and identifiers only.
- Do not enter real welfare, MPRN, address or health information.
- Grant values are dated published references, subject to eligibility and change.
- Cost medians are planning benchmarks, not quotations.
- Potential BER ranges are prototype sensitivity illustrations, not DEAP assessments.
- Live AI requires a configured OpenAI key. The deterministic pathway remains available without it.

If a live dependency fails, continue with the saved scenarios, dated evidence and generated reports. Do not imply that the source refresh, cloud deployment or live BER integration has been demonstrated.
