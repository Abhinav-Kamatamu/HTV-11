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
   - One-time intake questionnaire (CANRISK inputs, family history, waist, meds)
2. **Engine runs** (`src/engine`, deterministic, unit tested)
   - Validated scores: CANRISK, FIB-4, home BP average vs threshold, eGFR/ACR staging
   - Trend math per metric: slope, projected threshold crossing date, deviation from personal baseline
   - Symptom accumulation: decayed, weighted sums per condition cluster
   - Output: **flags** with severity, evidence readings, rule used, citation
3. **Clinician reviews** in the dashboard: patients sorted by risk, click in, see trends, the
   flag, *why* it fired, and a Gemini-written summary that only cites the source list.
   Clinician clicks **Validate** (optionally edits a message) or **Dismiss** (with reason).
4. **Patient is notified** only after validation: "Dr. X would like to book a visit to talk about
   your blood sugar trend."
5. **Visit prep**: one-click summary of the last N weeks for the appointment.

## 4. MVP scope (must ship)

- [ ] Fake login with role switcher (patient / clinician), no real auth
- [ ] Clinician: patient list sorted by risk, severity filter
- [ ] Clinician: patient detail with trend charts (labs over years, vitals over weeks), flags with
      "why" panel and citations, validate / dismiss
- [ ] Patient: log meal photo, device photo, symptom chat, see own timeline and messages
- [ ] Gemini extraction for meal photo, device photo, lab PDF, symptom text
- [ ] Engine: HbA1c/FPG trend + projection, eGFR decline + ACR, home BP average, FIB-4,
      CANRISK, symptom clusters
- [ ] Synthetic dataset: ~25 patients, 3 to 5 years of labs, 90 days of daily data, with 3 story
      patients (§6)
- [ ] Deployed at a public URL

## 5. Out of scope (decided, see docs/DECISIONS.md)

- Body/physique photos for "growth" analysis: unreliable, invasive, no clinical anchor
- Recording full doctor appointments: privacy-heavy and already served by AI scribes. Stretch only:
  paste a visit note and extract problems
- "Collect as much as possible": we collect what feeds a score or a trend, and say so in the UI
- Real EHR integration, real auth, native mobile app (responsive web + camera input instead)
- Any diagnosis language. We flag *risk trajectories* for clinician review

## 6. Demo script (3 minutes, the thing we are building toward)

1. (20s) Hook: three yearly HbA1c results: 5.5, 5.7, 5.9. Each one is under Diabetes Canada's 6.0%
   prediabetes line and each got "looks fine". Flip to the chart: the projection line enters the
   prediabetes range next year and reaches 6.5% within about three years.
2. (40s) Clinician dashboard: queue sorted by risk. Open **Patient A** (creeping HbA1c, rising waist,
   symptom chat mentioning thirst and fatigue 9 times in 6 weeks). Show the "why" panel and citations.
3. (40s) **Patient B**: eGFR sliding ~6/yr while still above 60, plus home BP average 141/88 from
   device photos. Validate the flag, send the message, switch to patient view, message arrives.
4. (40s) Live input on stage: snap the hackathon pizza and a BP monitor screen (or a printed photo of one),
   watch both land in the timeline and nudge the scores.
5. (20s) **Patient C**: ALT/GGT/triglycerides creeping + waist -> FIB-4 still low, flagged as "monitor",
   showing we don't over-alarm. Close on privacy and clinician-in-the-loop.

## 7. Stretch (only after MVP is demo-ready)

- Care home mode: staff photo of meal tray before and after -> % eaten -> intake trend per resident
- Grocery receipt photo -> diet pattern (ultra-processed share, sugary drinks) with far less effort than per-meal photos
- Visit note paste -> problem list extraction
- Weekly patient digest
- Evidence agent (Papiers angle): for a validated flag, agent pulls recent guideline/papers, clinician
  marks which are relevant, building a per-patient evidence trail
