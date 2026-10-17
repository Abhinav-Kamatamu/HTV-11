# Architecture

Proposed defaults. Change them in the first hour if the team prefers something else, and log it
in `docs/DECISIONS.md`. After hour 2, changing the stack needs the whole team.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript, one repo, API in route handlers | One language, one deploy, fast UI iteration |
| UI | Tailwind + shadcn/ui, Recharts for trend charts | Polished dashboard quickly |
| DB | Postgres on **Tiger Data** (TimescaleDB), `observations` as a hypertable, continuous aggregates for weekly/monthly views | Time-series is the core data shape, and it is an MLH prize |
| Dev DB | The shared Tiger Cloud service (no local Docker); `DATABASE_URL` in `.env.local` | One database for the team and for judges; `stats_agg` and `heartbeat_agg` come from `timescaledb_toolkit`, confirmed there |
| DB access | `pg` + Drizzle ORM (raw SQL for hypertable / aggregate setup) | Typed queries, SQL escape hatch |
| AI | Gemini via `@google/genai`, model name from `GEMINI_MODEL` env var | Multimodal (photos, PDFs), MLH prize |
| Validation | zod for every Gemini response and API body | LLM output is untrusted input |
| Tests | Vitest for `src/engine` | The engine must be provably right |
| Hosting | Docker on a **Vultr** instance (free credits), domain via **GoDaddy Registry** | Public URL for judges, two MLH prizes |
| Mobile | Responsive web, `<input type="file" accept="image/*" capture="environment">` | Camera on phones, no app store |

## Folder ownership (lanes)

```
src/
  app/(clinician)/...     lane: clinician
  app/(patient)/...       lane: patient
  app/api/...             lane: core
  components/ui/...       shared, small edits only, note them in the relay file
  db/                     lane: core   (schema.ts, migrations, seed/)
  engine/                 lane: engine (scores.ts, trends.ts, symptoms.ts, flags.ts, sources.ts, *.test.ts)
  ai/                     lane: engine (gemini.ts, prompts/, schemas.ts)
docs/, pitch/             lane: pitch
```

## Data model (first cut)

```sql
patients(id, name, dob, sex, clinician_id, intake jsonb, synthetic bool, created_at)
clinicians(id, name)
observations(patient_id, ts, metric, value, unit, source, confidence, raw_ref)   -- hypertable on ts
meals(id, patient_id, ts, photo_url, items jsonb, kcal, carbs_g, protein_g, fat_g, fibre_g, sodium_mg, confidence)
symptom_logs(id, patient_id, ts, text, codes jsonb, red_flag bool)
lab_reports(id, patient_id, collected_at, file_url, extracted jsonb)
flags(id, patient_id, created_at, condition, kind, severity, title, points int, contributions jsonb, evidence jsonb, rule, source_ids text[],
      status, clinician_note, resolved_at)
messages(id, patient_id, flag_id, ts, body, read_at)
```

Continuous aggregates: `obs_daily`, `obs_weekly`, `obs_monthly` (avg/min/max/count per metric).

## API (route handlers)

```
POST /api/ingest/meal        multipart photo  -> meal + observations
POST /api/ingest/device      multipart photo  -> observations
POST /api/ingest/labs        multipart pdf/img -> lab_report + observations
POST /api/ingest/symptom     { text }          -> symptom_log (+ red-flag response)
POST /api/engine/run         { patientId? }    -> recompute flags
GET  /api/clinician/patients ?severity=        -> ranked list
GET  /api/patients/:id/summary                 -> trends, flags, recent logs
POST /api/flags/:id/validate { note, message } -> flag validated + message created
POST /api/flags/:id/dismiss  { reason }
GET  /api/patients/:id/messages
```

Engine runs on every ingest for that patient, plus a manual "re-run all" button for demos.

## Synthetic data (`src/db/seed/`)

Deterministic generator (seeded RNG) so every teammate gets identical data:

- ~25 patients, labs every 6 to 12 months for 3 to 5 years, 90 days of daily vitals/steps/sleep,
  scattered meals and symptom logs. Lab trends use Mann-Kendall, which needs 4 or more points, so
  every patient meant to show a lab trend has at least that many
- `--scale 1000` generates 1,000 patients from the same seeded RNG for the benchmark page
  (`docs/RISK_ENGINE.md` §9); the default stays ~25
- Story patients (match `docs/SPEC.md` §6): **A** creeping HbA1c (six twice-yearly points, 4.9 to 5.4, every one below 5.5)
  + waist + thirst/fatigue chat,
  **B** eGFR decline ~6/yr + ACR rising + home BP ~141/88, **C** ALT/GGT/TG creeping with low FIB-4,
  plus a few clean controls and one urgent case for the top of the list
- Every synthetic row has `source = 'synthetic'` and the UI shows a "Synthetic demo data" badge

## Env vars (`.env.example`)

`DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `UPLOAD_DIR`, `DEMO_MODE`
