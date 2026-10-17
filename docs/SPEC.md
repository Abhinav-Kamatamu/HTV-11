# Undertow: product spec

> Working name. "Each result looked normal. The trend didn't."

## 1. Problem

Silent killers (type 2 diabetes, chronic kidney disease, hypertension, fatty liver disease / MASLD)
build up over years with few symptoms. A family doctor sees a patient a few times a year,
for a specific complaint, and judges each lab result against a fixed range. A value that is
"normal" three years in a row can still be marching steadily toward diagnosis, and the small
day-to-day signals (thirst, fatigue, a skipped walk, salty takeout, a creeping home BP) never
reach the clinician at all.

## 2. Users

| Persona | Who | What they need |
|---|---|---|
| **Clinician** (primary, the judge-facing user) | Family physician or NP in an Ontario primary care team | A ranked queue of patients whose *trajectory* is worrying, with the reason and the evidence, in under 30 seconds per patient |
| **Patient** | Adult 35+ with at least one risk factor | A low-effort way to log what matters, and reassurance that someone is watching the long game |

PointClickCare framing: the clinician dashboard *is* the care-team tool. Optional "care home mode"
(stretch, §7) lets staff log meal-tray photos for residents.

## 3. Core loop

1. **Patient logs** (low effort, mostly photos and one-liners)
   - Meal photo -> nutrient estimate with a confidence level
   - Photo of a device screen (BP cuff, glucometer, scale) -> structured reading
   - Lab report PDF/photo -> structured lab values (HbA1c, fasting glucose, creatinine/eGFR,
     ACR, ALT, AST, GGT, lipids, platelets)
   - Free-text "how I feel" chat ("bit of a headache, really thirsty today") -> coded symptoms
     with a weight
   - Weekly sleep check-in (three yes/no taps: snoring, daytime tiredness, observed pauses in breathing)
   - One-time intake questionnaire (CANRISK inputs, family history, waist, neck circumference, meds)
2. **Engine runs** (`src/engine`, deterministic, unit tested; math in `docs/RISK_ENGINE.md`)
   - Validated scores: CANRISK, FIB-4, home BP average vs threshold, eGFR/ACR staging, STOP-Bang
   - Trend math per metric: lab trends use Mann-Kendall + Sen's slope (robust with a handful of
     irregular points), vitals use regression computed inside Tiger Data; projected threshold
     crossing date; deviation from personal baseline; CUSUM change-points ("shifted around Sep 3")
   - Co-occurrence: metabolic syndrome (3 of 5 criteria) catches signals that are each sub-threshold
   - Symptom accumulation: decayed, weighted sums per condition cluster
   - Silent patients: Tiger Data `heartbeat_agg` finds people who stopped logging
   - Output: **flags** with severity, a **points ledger** (every layer adds points with a reason),
     evidence readings, rule used, citation
3. **Clinician reviews** in the dashboard: patients sorted by risk, click in, see trends, the
   flag, *why* it fired (the points ledger, one line per layer with its citation), and a
   Gemini-written summary that only cites the source list. Points are "priority points", not a
   probability. Clinician clicks **Validate** (optionally edits a message) or **Dismiss** (with reason).
4. **Patient is notified** only after validation: "Dr. X would like to book a visit to talk about
   your blood sugar trend."
5. **Visit prep**: one-click summary of the last N weeks for the appointment.

## 4. MVP scope (must ship)

- [ ] Fake login with role switcher (patient / clinician), no real auth
- [ ] Clinician: patient list sorted by risk, severity filter
- [ ] Clinician: patient detail with trend charts (labs over years, vitals over weeks, change-point
      markers), flags with points-ledger "why" panel and citations, validate / dismiss
- [ ] Clinician: "stopped logging" badge in the queue
- [ ] Patient: log meal photo, device photo, symptom chat, weekly sleep check-in, see own timeline and messages
- [ ] Gemini extraction for meal photo, device photo, lab PDF (including lipids), symptom text
- [ ] Engine: HbA1c/FPG trend + projection (Mann-Kendall + Sen's slope), eGFR decline + ACR, home BP
      average, FIB-4, CANRISK, symptom clusters, CUSUM change-points, metabolic syndrome (3 of 5),
      STOP-Bang, points ledger
- [ ] Tiger Data does the vitals math: `stats_agg` slopes, R² and crossing dates in continuous
      aggregates, `heartbeat_agg` for silent patients
- [ ] Synthetic dataset: ~25 patients, 3 to 5 years of labs (at least 6 HbA1c points for Patient A),
      90 days of daily data, with 3 story patients (§6)
- [ ] Scale-mode seed (1,000 patients) and a `/benchmark` page that measures the Tiger Data path
      against the alternatives. The demo itself stays on the 25-patient dataset
- [ ] Deployed at a public URL

## 5. Out of scope (decided, see docs/DECISIONS.md)

- Body/physique photos for "growth" analysis: unreliable, invasive, no clinical anchor
- Recording full doctor appointments: privacy-heavy and already served by AI scribes. Stretch only:
  paste a visit note and extract problems
- "Collect as much as possible": we collect what feeds a score or a trend, and say so in the UI
- Real EHR integration, real auth, native mobile app (responsive web + camera input instead)
- Any diagnosis language. We flag *risk trajectories* for clinician review. That includes
  metabolic syndrome (a count of guideline criteria) and sleep apnea (a STOP-Bang screen)
- Sleep staging or wearable sleep analysis: the sleep check-in is three questions, not a sleep study

## 6. Demo script (3 minutes, the thing we are building toward)

1. (20s) Hook: three yearly HbA1c results: 5.5, 5.7, 5.9. Each one is under Diabetes Canada's 6.0%
   prediabetes line and each got "looks fine". Flip to the chart: the projection line enters the
   prediabetes range next year and reaches 6.5% within about three years. (The chart shows the
   patient's full history, at least 6 points ending in those three; Mann-Kendall needs 4 or more
   points to call a trend, so the seed for Patient A must not stop at three.)
2. (40s) Clinician dashboard: queue sorted by risk. Open **Patient A** (creeping HbA1c, rising waist,
   symptom chat mentioning thirst and fatigue 9 times in 6 weeks). Show the "why" panel: the points
   ledger, one line per layer with its reason and citation, adding up to the severity.
3. (40s) **Patient B**: eGFR sliding ~6/yr while still above 60, plus home BP average 141/88 from
   device photos, with a CUSUM marker on the BP chart ("shifted up around Sep 3"). Validate the flag,
   send the message, switch to patient view, message arrives.
4. (40s) Live input on stage: snap the hackathon pizza and a BP monitor screen (or a printed photo of one),
   watch both land in the timeline and nudge the scores.
5. (20s) **Patient C**: ALT/GGT/triglycerides creeping + waist -> FIB-4 still low, but metabolic
   syndrome shows "3 of 5 criteria, 2 unknown", flagged as "monitor", showing we don't over-alarm.
6. (20s) Tiger Data beat: open `/benchmark` on the 1,000-patient dataset. Slopes, R² and crossing dates
   for everyone, plus the list of patients who stopped logging, computed in the database. Show the measured
   comparison. Close on privacy and clinician-in-the-loop. (If the demo runs long, this beat is the first cut.)

## 7. Stretch (only after MVP is demo-ready)

- Care home mode: staff photo of meal tray before and after -> % eaten -> intake trend per resident
- Grocery receipt photo -> diet pattern (ultra-processed share, sugary drinks) with far less effort than per-meal photos
- Visit note paste -> problem list extraction
- Weekly patient digest
- Evidence agent (Papiers angle): for a validated flag, agent pulls recent guideline/papers, clinician
  marks which are relevant, building a per-patient evidence trail
