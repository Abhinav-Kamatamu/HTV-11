# Decisions

One line each, newest at the bottom. Format: `YYYY-MM-DD HH:MM · lane · decision · why`.

- 2026-10-17 · team · Risk engine is deterministic and cited, Gemini only extracts and explains · credibility, explainability (PCC bonus), no hallucinated risk
- 2026-10-17 · team · Clinician validates every flag before any patient message · safety, human in the loop
- 2026-10-17 · team · Cut physique/"growth" photos and full appointment recording from MVP · unreliable / privacy-heavy, not demoable
- 2026-10-17 · team · Collect only data that feeds a score or trend · privacy (PHIPA), honest pitch
- 2026-10-17 · team · Canadian/SI units throughout · Ontario judges and guidelines
- 2026-10-17 · team · Stack per ARCHITECTURE.md (Next.js/TS, Tiger Data, Gemini, Vultr) · one language, stacks MLH prizes
- 2026-10-17 02:30 · team · Lab trends use Mann-Kendall + Sen's slope (n ≥ 4, p < 0.10), not OLS · labs are 4 to 10 irregular points where one outlier swings OLS and R² means little; note a 3-point series can never be significant, so Patient A's seed needs ≥ 6 HbA1c points (T-011)
- 2026-10-17 02:30 · team · Dense vitals keep OLS, computed in Tiger Data with `stats_agg` in continuous aggregates (slope, R², crossing via `x_intercept` or `(threshold - intercept)/slope`); lab MK/Sen stays in the engine · the user asked for both; this is the split (sparse labs vs dense vitals), change it here if you meant otherwise
- 2026-10-17 02:30 · team · CUSUM change-points promoted from stretch to MVP (k = 0.5, h = 5, 28-day reference) · answers "when did it change"; supporting signal only, never creates a flag alone
- 2026-10-17 02:30 · team · Metabolic syndrome (3 of 5 criteria, unknown ≠ not met) is a co-occurrence layer · catches signals that are each sub-threshold; worded as a criteria count, not a diagnosis
- 2026-10-17 02:30 · team · Weekly sleep check-in (snoring, tired, observed apnea) plus neck circumference at intake feeds STOP-Bang; the engine fills age, sex, BMI, BP · cheap to log, links OSA risk to HTN/T2D/MASLD; STOP-Bang ≥ 5 fires `osa` at monitor, 3 to 4 is supporting only
- 2026-10-17 02:30 · team · Every layer adds points with an engine-templated reason; the list is the why panel; "priority points", not a probability; per-layer cap 4 · explainability, keeps Gemini out of scoring; point values and bands are tunable starting values (`points.ts`)
- 2026-10-17 02:30 · team · `heartbeat_agg` finds patients who stopped logging (active ≥ 50% of prior 30 days, silent ≥ 7 days); clinician-facing, outreach still needs validate · absence of data must not read as stability
- 2026-10-17 02:30 · team · Local DB image must include `timescaledb_toolkit` (likely `timescaledb-ha`, not plain `timescale/timescaledb` as ARCHITECTURE.md says); confirm in T-002 and update ARCHITECTURE.md · `stats_agg` and `heartbeat_agg` live in the toolkit extension
- 2026-10-17 02:30 · team · Scale-mode seed (`--scale 1000`) and `/benchmark` page; the 3-minute demo stays on 25 patients with the benchmark as the cuttable last beat · Tiger Data prize story, numbers measured live and never hard-coded
- 2026-10-17 02:45 · team · docker-compose.yml and ARCHITECTURE.md now use `timescale/timescaledb-ha:pg16`, data volume mounted at `/home/postgres/pgdata/data` (the -ha image does not use /var/lib/postgresql/data); written without being able to run Docker, so T-002 must confirm it boots, has the toolkit and persists · completes the 02:30 image decision
- 2026-10-17 02:40 · core · Scaffold: Next.js 16 (App Router, `src/`, `@/*` alias), Tailwind v4, ESLint flat config, Vitest 5 (node env, `src/**/*.test.ts`), shadcn/ui (base-nova style, neutral; its `cn` comes from the shadcn-team `cn` package, so no clsx/tailwind-merge) · T-001; Next 16 differs from older docs, read `node_modules/next/dist/docs/` before using APIs from memory (see AGENTS.md)
- 2026-10-17 02:40 · core · `@types/node` pinned to ^24 (matches Node 24) because Vitest 5 peers need >=22.12 and create-next-app ships ^20 · npm ERESOLVE otherwise
- 2026-10-17 02:40 · core · `db:migrate` and `db:seed` are echo stubs until T-003/T-004 · keeps `npm run` names stable for other lanes
