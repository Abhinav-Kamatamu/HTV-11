# Tasks

Status: `todo` · `doing` · `done` · `blocked`. Claim a task by setting `doing` + your lane and
pushing (see CLAUDE.md §2). One `doing` task per lane at a time.

## Lanes

| Lane | Owns | Teammate (fill in) |
|---|---|---|
| core | `src/app/api`, `src/db`, deploy | |
| engine | `src/engine`, `src/ai` | |
| clinician | `src/app/(clinician)` | |
| patient | `src/app/(patient)` | |
| pitch | `docs/`, `pitch/`, Devpost, DEV post | (rotates) |

## Board

| ID | Lane | Task | Status | Depends on |
|---|---|---|---|---|
| T-001 | core | Scaffold Next.js + TS + Tailwind + shadcn + Vitest + ESLint, `npm run dev/lint/test` work | todo | |
| T-002 | core | `docker-compose.yml` Timescale for local dev, Tiger Cloud project created, `DATABASE_URL` in team chat (not git) | todo | |
| T-003 | core | Drizzle schema per ARCHITECTURE.md, migration, hypertable + continuous aggregates, `npm run db:migrate` | todo | T-001 T-002 |
| T-004 | core | Deterministic seed generator with story patients A/B/C + controls, `npm run db:seed` | todo | T-003 |
| T-005 | core | Ingest + clinician + flags API routes (stubs first, then real) | todo | T-003 |
| T-006 | core | Deploy to Vultr, register domain, HTTPS | todo | T-001 |
| T-020 | engine | Verify every threshold in RISK_ENGINE.md §2 against the source, write `sources.ts` with URLs | todo | |
| T-021 | engine | `scores.ts`: CANRISK, FIB-4, FLI, home BP average, eGFR/ACR staging + tests | todo | T-020 |
| T-022 | engine | `trends.ts`: OLS slope, projected crossing, baseline z-score + tests | todo | T-001 |
| T-023 | engine | `symptoms.ts`: code list, weights, decayed cluster score, red-flag list + tests | todo | T-001 |
| T-024 | engine | `flags.ts`: combine into Flag objects, ranking function + tests | todo | T-021 T-022 T-023 |
| T-025 | engine | `ai/gemini.ts` + zod schemas: extractMeal, extractDevice, extractLabs, codeSymptoms | todo | T-001 |
| T-026 | engine | `explainFlag` + `visitSummary` restricted to sources.ts | todo | T-024 T-025 |
| T-040 | clinician | Role switcher + layout shell | todo | T-001 |
| T-041 | clinician | Patient queue sorted by risk, severity filter (mock data until T-005) | todo | T-040 |
| T-042 | clinician | Patient detail: lab trend charts with projection line + threshold bands | todo | T-040 |
| T-043 | clinician | Flag card with "why" panel, evidence list, citations, validate/dismiss | todo | T-042 |
| T-044 | clinician | Visit prep summary view | todo | T-026 |
| T-060 | patient | Patient home: timeline + messages | todo | T-040 |
| T-061 | patient | Camera upload for meal + device photo with result preview | todo | T-060 |
| T-062 | patient | Symptom chat (with red-flag "seek care now" response) | todo | T-060 |
| T-063 | patient | Lab report upload | todo | T-061 |
| T-080 | pitch | Devpost draft, architecture diagram, 3-min demo script rehearsal | todo | |
| T-081 | pitch | DEV.to write-up (MLH DEV prize) | todo | |
| T-082 | pitch | Demo props: printed BP monitor photo, sample lab PDF, backup screen recording | todo | |
