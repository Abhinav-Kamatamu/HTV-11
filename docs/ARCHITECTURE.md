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
| Hosting | Docker on a **Vultr** instance, **Toronto region**, domain via **GoDaddy Registry** | Public URL for judges, two MLH prizes, and a Canadian region for a health product's data, not hosting picked only because it's free |
| Mobile | Responsive web, `<input type="file" accept="image/*" capture="environment">` | Camera on phones, no app store |

## Vultr usage beyond hosting

The goal is for Vultr to actually do something for the product, not just be the box the container
happens to run on. Four pieces, in increasing order of commitment:

1. **Deploy (T-006, required).** Docker container on a Toronto-region instance, HTTPS, GoDaddy
   domain. Toronto specifically: patient data for a health product staying in Canada is a real
   reason, not a rationalization, for the region choice.
2. **Nightly engine run (T-013, required for the gap/trend story to actually work post-demo).**
   A scheduled job on the same server re-runs `/api/engine/run` for every patient. Silence
   detection (`heartbeat_agg`, RISK_ENGINE §8) and trend/projection aging (today being one day
   further past the last reading than yesterday was) are both functions of wall-clock time, not
   of any ingest event — without a nightly run, a patient who stops logging or whose projected
   threshold crossing creeps closer never gets a fresh flag until something else happens to
   trigger a recompute.
3. **Object storage (T-014, optional).** Move `UPLOAD_DIR` to Vultr Object Storage if a Canadian
   region is available there too, so uploaded meal/device/lab files survive a container restart
   instead of living only in the container's filesystem.
4. **Serverless Inference vector store (T-032, stretch, engine lane).** Embed the guideline
   excerpts behind `src/engine/sources.ts` in a Vultr Serverless Inference vector store so the
   why panel can show the exact guideline sentence next to a citation instead of just a name and
   a link. Gated on confirming hackathon credits cover Serverless Inference and checking where it
   processes data first — only the public guideline text ever gets embedded, never patient data.

See `docs/PRIZES.md` for how each of these maps to the Vultr / GoDaddy prize tracks.

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
  app/(clinician)/lab/... lane: lab    (stretch, gated — see TASKS.md T-090 to T-093)
  lab/                    lane: lab    (stretch, gated — Papiers.ai autoresearch challenge)
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
- Story patients (match `docs/SPEC.md` §6) have six lab draws every ~182 days (~2.5 years), strictly
  monotone on their story metrics and flat, noise-free baselines elsewhere (noise only on controls):
  **A** creeping HbA1c (4.65, 4.8, 4.95, 5.1, 5.25, 5.4, every one below 5.5, projected to reach 6.0 in
  ~2 years) + waist + thirst/fatigue chat, STOP-Bang 3;
  **B** eGFR decline ~6/yr + ACR rising + home BP ~141/88, STOP-Bang 7 (high);
  **C** ALT/GGT/TG creeping with low FIB-4, metabolic syndrome 3 of 5 met (waist, TG, BP by treatment)
  with HDL and fasting glucose never drawn (2 unknown);
  plus clean controls (home BP below 130/80) and one urgent case for the top of the list
- Intake lives in `patients.intake` (`height_cm`, `medications`); neck circumference, `hdl` and the weekly
  sleep check-ins (`sleep_snoring`, `sleep_tired`, `sleep_observed_apnea`, 0/1) are observations
- Every synthetic row has `source = 'synthetic'` and the UI shows a "Synthetic demo data" badge

## Env vars (`.env.example`)

`DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `UPLOAD_DIR`, `DEMO_MODE`
