# Prize targets

Goal: **2nd overall** (the keyboard), stacking every prize we fit without bending the product.
Check the Devpost rules for how many tracks a submission can enter and list them in priority order.

## Primary

| Prize | Fit | What judges need to see | Owner |
|---|---|---|---|
| Top 3 overall | Plausible with polish | Working live demo, one memorable moment (the "normal results, bad trend" chart), clean UI, clear story | everyone |
| PointClickCare "Catch It Early" | Strong | Care-team interface, real health scenario, AI turning raw data into an early signal, **explains why it flagged** | clinician + engine |
| Healthcare Innovation & Well-being | Strong | Preventative, personalized, improves patient care | pitch |
| AI for Social Impact | Good | Ethical design, transparency (citations, human in the loop), measurable impact story | pitch |

## MLH (cheap adds, no misdirection)

| Prize | Requirement | Our use |
|---|---|---|
| Best Use of Gemini API | Build with Gemini | Multimodal extraction (meals, device screens, lab PDFs), symptom coding, cited explanations |
| Best Use of Tiger Data | Use Tiger Data (Postgres for time series) | `observations` hypertable + continuous aggregates powering every trend chart. Say this explicitly in the demo |
| Best Use of Vultr | Run on Vultr, extra credit for using it meaningfully | Toronto-region deploy (patient data stays in Canada, not just "it's free"), plus a nightly scheduled job that re-runs the engine for every patient — silence detection and trend-projection aging are both time-based, not event-based, so they need something to run even when nobody ingests anything. Optional: Object Storage for uploads (T-014), stretch: a Serverless Inference vector store behind the why panel's citations (T-032) |
| Best Domain from GoDaddy Registry | Register a domain via GoDaddy Registry, claim through MLH | Register the project domain, point it at the Toronto Vultr instance, HTTPS |
| DEV Writing Challenge | Publish a write-up on DEV | Post after the event: "deterministic engine, LLM at the edges" makes a good technical story |

## Maybe

| Prize | Why maybe | Cost to aim |
|---|---|---|
| Papiers.ai (4x Claude Max 5x) | Brief read 2026-10-17: humans + AI agents doing research together | Stretch "autoresearch lab" in SPEC §7, lane `lab` (TASKS.md T-090 to T-093, DECISIONS.md 2026-10-17): hidden-ground-truth evaluation harness on the `--scale` seed plus a Gemini agent loop that proposes one config change at a time, cites the clinician feedback behind each choice, and asks the clinician on any trade-off, with a lab UI showing the experiment history. Gated: do not start before the main demo flow works end-to-end |

## Not a fit (don't chase)

KAZE (acute incapacitation safety), School of Cities (Toronto civic/election data), FDM (career well-being),
Climate, FinTech, Solana (putting health data on a chain is a negative in a health pitch), Beginner, Solo.
