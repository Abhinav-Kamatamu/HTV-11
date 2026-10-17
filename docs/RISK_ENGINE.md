# Risk engine

The engine is the credible core of the project. It is deterministic, unit tested, and every
output points at a source. Gemini sits on either side of it (extraction in, explanation out),
never in the middle.

```
raw input ──Gemini extract──> observations ──engine──> flags + points ledger ──Gemini explain──> clinician text
(photo, PDF, chat)            (typed, unit, confidence)  (rules, scores, trends)   (cites only sources.ts)
```

> **Thresholds in §2 were verified on 2026-10-17 (T-020).** The values and URLs live in
> `src/engine/sources.ts` (`SOURCES`, `THRESHOLDS`); import them, do not retype them. Each source there
> is marked `primary`, `secondary` or `convention` so you can see what was read directly. Point values
> and tuning constants (§3, §6) are still starting values to calibrate against the seed data, not findings.

## 1. Observations

Everything becomes a row: `(patient_id, ts, metric, value, unit, source, confidence)`.
`source` is one of `lab`, `device_photo`, `meal_photo`, `chat`, `intake`, `manual`, `synthetic`.
Low-confidence extractions (e.g. meal estimates) can feed trends but never fire a flag alone.

Metrics added for the co-occurrence and sleep layers (§4): `triglycerides`, `hdl`, `waist_cm`,
`neck_cm`, and the sleep check-in answers `sleep_snoring`, `sleep_tired`, `sleep_observed_apnea`
(0/1, `source = manual`) plus optional `sleep_hours`. No new table: they are observations.

## 2. Validated scores and thresholds (Canadian guidelines where possible)

| Condition | Inputs | Rule (to verify) | Source to cite |
|---|---|---|---|
| Type 2 diabetes | HbA1c | at risk 5.5 to 5.9%, prediabetes 6.0 to 6.4%, diabetes ≥ 6.5% | Diabetes Canada CPG 2018 |
| | Fasting plasma glucose | at risk 5.6 to 6.0, prediabetes 6.1 to 6.9 mmol/L, diabetes ≥ 7.0 | Diabetes Canada CPG 2018 |
| | CANRISK questionnaire | < 21 low, 21 to 32 moderate, 33 to 42 high, 43 to 87 very high (the Task Force page merges low and moderate as 0 to 32) | PHAC CANRISK, CTFPHC |
| Chronic kidney disease | eGFR (CKD-EPI 2021) | < 60 sustained > 3 months = G3a+ (G3a is 45 to 59) | KDIGO 2024 |
| | eGFR slope | sustained decline > 5 mL/min/1.73m²/yr = rapid | KDIGO 2012 (not in the 2024 text) |
| | Urine ACR | 3 to 30 mg/mmol = A2, > 30 = A3 | KDIGO 2024 |
| Hypertension | Home BP average (≥ 7 days) | ≥ 130/80 (2025 primary-care guideline, same value for office, ambulatory and home). The 2020 value was 135/85, kept as `homeBpLegacy2020` | Hypertension Canada 2025 |
| Fatty liver / fibrosis | FIB-4 = age × AST / (platelets × √ALT) | < 1.30 low, > 2.67 high (age ≥ 65: lower cutoff 2.0) | AASLD 2023 |
| | Fatty Liver Index (TG, BMI, GGT, waist) | < 30 rules out, ≥ 60 rules in steatosis; TG enters the formula in mg/dL (mmol/L × 88.57) | Bedogni 2006 |
| Metabolic syndrome | 5 criteria, see §4 | ≥ 3 of 5 met | Alberti 2009; waist from Health Canada 2003 (102 / 88 cm) |
| Sleep apnea risk | STOP-Bang, see §4 | 0 to 2 low, 3 to 4 intermediate, 5 to 8 high | Chung 2016 |
| Trend significance | Mann-Kendall S statistic | n ≥ 4 and two-sided p < 0.10 (our tuning, not the papers') | Mann 1945, Kendall 1975 |
| Slope estimate | Sen's slope | median of pairwise slopes | Sen 1968 |
| Change-point | Tabular CUSUM | k = 0.5, h = 5 in baseline SDs (textbook defaults, tunable) | Page 1954 |

## 3. Trend math (the differentiator)

Two regimes, because the data has two shapes.

### 3a. Labs: Mann-Kendall + Sen's slope (sparse, irregular, years of history)

A patient has 4 to 10 lab points over 3 to 5 years, unevenly spaced. One haemolysed sample or one
non-fasting draw can swing an ordinary least squares line, and R² on five points means little.
So labs use a rank-based pair of tools instead of OLS:

- **Trend test:** Mann-Kendall on the time-ordered values. `S = Σ sign(y_j − y_i)` over all pairs
  `i < j`. Exact p-value for n ≤ 10, normal approximation with tie correction above that.
  Same-day duplicates are collapsed to their mean first.
- **Slope:** Sen's slope = median of all pairwise slopes `(y_j − y_i) / (t_j − t_i)`, reported per year.
  Intercept = median of `y_i − slope × t_i`. A 90% interval comes from the ranked pairwise slopes.
- **Gate:** a lab trend only counts when n ≥ 4, p < 0.10, and the direction points toward a threshold.
  Known answers for tests: a strictly monotone series gives exact two-sided p = 2/n!, so n = 3 gives
  0.333 (never significant), n = 4 gives 0.083, n = 5 gives 0.017. Three points can still be drawn on
  the chart as "not enough history to call a trend", but they earn no points.
- **Projected crossing:** `days_to_cross = (threshold − (intercept + slope × t_last)) / slope`.
  Only shown when the gate passes and the crossing is within 3 years. Also compute it with the lower and
  upper slope bounds so the clinician sees a range ("~7 months, range 4 to 14").
- **Rapid eGFR decline:** the KDIGO > 5 mL/min/1.73m²/yr rule is evaluated on the Sen slope.

### 3b. Vitals: OLS in the database (dense, daily, 30 to 90 days)

Home BP, weight, resting HR, steps and sleep hours have dozens of points, where OLS is fine and the
R² gate is meaningful. These are computed by Tiger Data (§8), not in application code:

- **Slope** per year, **R²**, and **projected crossing** of the relevant threshold over the window.
- Only show a crossing when R² ≥ 0.5, ≥ 14 daily points, and the crossing is within 3 years.

### 3c. Shared tools

- **Personal baseline deviation:** z-score of the last 7-day mean vs the patient's own prior 60 days
  (weight, resting HR, home BP, steps, sleep). Catches change that is normal for the population but not for them.
- **Change-point (CUSUM):** answers "when did it change", where the slope answers "where is it heading".
  For each daily vitals series, standardize each day against the patient's reference period (first 28 days
  of the window; floor σ so a very steady series does not trigger on noise), then
  `S⁺_t = max(0, S⁺_{t−1} + z_t − k)` and `S⁻_t = max(0, S⁻_{t−1} − z_t − k)`.
  An alarm fires when either exceeds `h`. The change date is searched inside the run that ended in the alarm
  (from the last day the sum was 0): the day after which the cumulative deviation rises most steeply.
  Missing days are skipped, not zero-filled. After an alarm, re-baseline from the alarm day (the new level).
  A **practical significance gate** discards alarms whose shift, measured from the alarm day over the next
  28 days in the alarm's direction, is under 1.5 reference SDs: with the SD estimated from ~28 readings plain
  CUSUM over-alarms on stable series (on the seed, 20 of 52 home BP series alarmed without the gate).
  Output is e.g. "home systolic shifted up ~9 mmHg around Sep 3".

A trend flag fires when a metric is still inside the normal range but its projection crosses a threshold
within the horizon. This is the "each result looked normal" story. A change-point on its own is a supporting
signal: it earns points (§6) but does not create a flag by itself.

**Trend flags fire only for metrics that have a guideline threshold in `sources.ts`:** HbA1c (6.0), fasting
glucose (6.1), eGFR (60), ACR (3) and home BP (130/80). Every other series (ALT, AST, GGT, platelets, HDL,
creatinine, weight, steps, sleep, heart rate) is chart-only: it can be drawn and can carry a change-point,
but its trend earns no points and creates no flag.

## 4. Co-occurrence and sleep layers

Individually sub-threshold signals can compound. Two layers capture that, both deterministic.

### 4a. Metabolic syndrome (3 of 5)

Count how many of five criteria are met (Alberti 2009 harmonized definition, verified; waist uses the Canadian Health Canada cutoffs):

| # | Criterion | Cutoff (to verify) | Data |
|---|---|---|---|
| 1 | Central adiposity | waist ≥ 102 cm (men) / ≥ 88 cm (women), Health Canada | `waist_cm` |
| 2 | Triglycerides | ≥ 1.7 mmol/L or on treatment | `triglycerides`, intake meds |
| 3 | HDL cholesterol | < 1.0 (men) / < 1.3 (women) mmol/L or on treatment | `hdl`, intake meds |
| 4 | Blood pressure | ≥ 130 systolic or ≥ 85 diastolic, or on treatment | home BP 30-day mean, intake meds |
| 5 | Fasting glucose | ≥ 5.6 mmol/L (no treatment override) | `fpg` |

Rules:
- A criterion with no recent data is **unknown**, never "not met". The UI shows "2 met, 2 unknown (TG, HDL
  missing)" so the clinician sees what a lab order would settle.
- Use the latest value within 12 months for labs and waist, the 30-day mean for BP.
- "On treatment" (non-empty `intake.medications`) only turns an existing, measured, sub-threshold reading
  into **met** for TG, HDL and BP; it never turns **unknown** into met, and it never applies to fasting
  glucose (DECISIONS.md 2026-10-17, engine). The synthetic seed has no glucose-lowering drug, so this keeps
  Patient C's HDL/FPG — never drawn — at "unknown" rather than wrongly "met".
- ≥ 3 met fires a `mets` flag at `monitor`. This is a count of guideline criteria for clinician review,
  not a diagnosis.

### 4b. Sleep check-in feeding STOP-Bang

A short weekly patient check-in: three yes/no taps and an optional hours-slept number. Neck
circumference is asked once at intake. STOP-Bang has eight items; the engine fills five from the record:

| Item | Source |
|---|---|
| **S**noring loudly | sleep check-in |
| **T**ired in the daytime | sleep check-in |
| **O**bserved apnea | sleep check-in |
| **P**ressure (treated hypertension) | intake meds / diagnoses, or home BP average ≥ 130/80 |
| **B**MI > 35 | weight + height |
| **A**ge > 50 | dob |
| **N**eck > 40 cm | `neck_cm` from intake |
| **G**ender male | patient record |

- Use the latest check-in within 90 days. Items with no data count as 0 and the score is displayed as a
  lower bound ("≥ 3, neck not recorded").
- 0 to 2 low, 3 to 4 intermediate, 5 to 8 high. BMI, age and neck are strict ("greater than"). Chung also upgrades some 3 to 4 scores to high (STOP ≥ 2 plus BMI > 35, neck > 40 or male); we do not apply that. Intermediate adds a supporting contribution to any
  open flag but does not fire alone. High (≥ 5) fires an `osa` flag at `monitor` regardless of the point
  bands, with the wording "screen suggests considering formal sleep assessment". We do not diagnose sleep
  apnea and we do not stage sleep from wearables.
- Link to other layers: an open hypertension, T2D or MASLD flag plus intermediate/high STOP-Bang is
  worth a mention in the why panel, because untreated sleep apnea can push all three.

## 5. Symptom weighting (the chat)

Gemini maps each message to zero or more symptom codes from a fixed list in `src/engine/symptoms.ts`,
with severity 1 to 3. It does not decide importance. The engine does:

- Each symptom has a base weight per condition cluster (e.g. `polydipsia` -> diabetes 0.8,
  `foamy_urine` -> CKD 0.7, `headache` -> hypertension 0.2, `ruq_discomfort` -> liver 0.5).
- Cluster score = sum over logs of `weight × severity × exp(-age_days / 21)`.
- A single minor headache contributes almost nothing and decays in weeks. Nine reports of thirst in
  six weeks add up. That is exactly the "how much is a minor headache worth" question, answered with
  a transparent formula the clinician can see.
- Red-flag symptoms (chest pain, stroke signs, etc.) bypass scoring: the patient sees "seek care now"
  instructions immediately and the clinician is notified. We do not try to triage emergencies with AI.

## 6. Points ledger and the "why" panel

Every layer that fires adds points **with a reason**. The list of contributions is the "why" panel:
the UI renders it row by row, and nothing else is needed to explain a score.

```ts
type Contribution = {
  layer: "threshold" | "score" | "trend" | "changepoint" | "cooccurrence" | "sleep" | "symptom" | "gap";
  points: number;               // from src/engine/points.ts, never from Gemini
  reason: string;               // one sentence, built from a template in the engine
  evidence: { metric: string; ts: string; value: number; unit: string }[];
  sourceIds: string[];          // keys into sources.ts
  stale?: true;                 // daily-series signal from a patient who stopped logging (gap layer, below)
};
```

Example ledger for Patient A (HbA1c condition):

```
+2  trend         HbA1c rising 0.3 %/yr (Sen), Mann-Kendall p = 0.003, reaches the 6.0% prediabetes line in ~2 yr  [Diabetes Canada CPG]
+3  symptom       Thirst reported 9 times in 6 weeks (decayed cluster score 3.4, capped at 3)
+1  changepoint   Weight shifted up ~2 kg around Sep 3
+1  sleep         STOP-Bang 3 (intermediate)                                                                  [Chung 2016]
= 7 points -> review
(the latest HbA1c, 5.4%, is under every Diabetes Canada line, so the threshold layer correctly adds nothing; the 6.5% diabetes line is ~3.7 yr away, outside the 3 yr horizon, so we never project it)
```

Rules:
- **Priority points, not a probability.** The UI says "priority points", never "% risk".
- **Reasons come from engine templates.** `explainFlag` receives the ledger and writes the three-sentence
  summary; it cannot add, remove or change a contribution, and it may cite only the sources on the rows.
- **Each layer is capped** at 4 points per condition so one noisy layer cannot dominate.
- **Severity bands** (tunable, calibrate so the seed story patients land where SPEC §6 says): 0 to 2 no
  flag, 3 to 5 `monitor`, 6 to 9 `review`, ≥ 10 `urgent`.
- **Severity floors** sit on top of the bands (decided 2026-10-17). A value in a guideline **diagnostic range**
  sets at least `review`. **Two or more conditions** in a diagnostic range set `urgent` on those flags.
  Diagnostic means sustained: HbA1c ≥ 6.5 or fasting glucose ≥ 7.0 (t2d); eGFR < 60 or ACR ≥ 3 on the latest
  two results at least 90 days apart (ckd, KDIGO chronicity); home BP average ≥ 130/80 over ≥ 7 days (htn).
  A single result in range is the **monitor range** (threshold layer +2) until it is confirmed, and it floors
  the flag at `monitor` with the label "unconfirmed, repeat test suggested" (single eGFR < 60, ACR ≥ 3,
  HbA1c 5.5 to 6.4, fasting glucose 5.6 to 6.9). A significant eGFR decline faster than 5 mL/min/1.73m²/yr
  (KDIGO 2012 rapid progression) floors the CKD flag at `review`; it earns no points. Metabolic
  syndrome, STOP-Bang, CANRISK, FIB-4 and FLI are screens, never diagnostic, so they never set a floor.
  A gap-only (`engagement`) flag is `monitor`.
- **Red-flag symptoms** (§5) keep their bypass: the patient is `urgent` immediately and the clinician is
  notified, whatever the points say. The red flag is a patient-level alert, not a condition flag.

Starting point values (all in `points.ts`):

| Layer | Trigger | Points |
|---|---|---|
| threshold | value in guideline monitor range / in diagnostic range | 2 / 4 |
| score | CANRISK high / very high; FIB-4 intermediate / high; FLI ≥ 60 | 2 / 3; 1 / 4; 2 |
| trend | gate passes and crossing ≤ 1 yr / 1 to 3 yr / moving toward threshold, no crossing in horizon | 4 / 2 / 1 |
| changepoint | adverse shift / adverse shift agreeing with an open trend on the same condition | 1 / 2 |
| symptom | decayed cluster score, rounded to 0.5 | up to 3 |
| cooccurrence | metabolic syndrome with 3 / 4 / 5 criteria met | 3 / 4 / 4 |
| sleep | STOP-Bang 3 to 4 / 5 to 8 | 1 / 2 |
| gap | stopped logging (§8) | 1 |

Implementation notes (T-031, `src/engine/points.ts` and `evaluate.ts`):
- **Monitor range** (threshold +2) is the guideline at-risk band: HbA1c 5.5 to 6.4, fasting glucose 5.6 to 6.9, a
  single eGFR < 60 or ACR ≥ 3. Home BP has no monitor range, only the sustained average. Those rows carry
  `unconfirmed: true`, and the ledger's `label` is "unconfirmed, repeat test suggested" unless the ledger is
  diagnostic. +2 alone is under the monitor band, so the floor (`basis: "unconfirmed_floor"`) is what raises the flag.
- **Floors** (`applyFloors`): diagnostic or rapid eGFR decline = at least review, unconfirmed = at least monitor,
  then two or more diagnostic conditions = urgent. The rapid-decline row is a 0-point trend row (it exists even
  when eGFR is already below 60 and so has no trend row) and is not a diagnostic range, so it never counts
  toward the "two diagnostic conditions" rule.
- **Trends** only count while the latest value is still on the near side of the line (an HbA1c already ≥ 6.0 or an
  ACR already ≥ 3 gets the threshold row instead) and never target the 6.5% diabetes line.
- **Supporting layers** (changepoint, sleep) count only when the condition already has a primary contribution
  (threshold, score, trend, cooccurrence or a symptom row with points). Change-points map weight to t2d and home
  BP to htn; a BP shift earns the "agrees with trend" 2 only when the same condition has a trend row. Sleep
  supports t2d, htn and masld, never ckd or mets.
- A row trimmed by the layer cap stays in the ledger, possibly at 0 points, with "Counted n of m points".
- **Stale** (gap layer): when the patient is silent, trend and changepoint rows built from daily series carry
  `stale: true` and end with "Last reading N days ago." Lab trends are never stale; labs are not logging.
- `detectSilence` in `silence.ts` is the pure version of the §8 heartbeat rule (≥ 7 calendar days quiet, logged on
  ≥ 15 of the 30 days ending on the last reading; heartbeats are the daily vitals, not labs). The T-008 query
  must agree with it, and `PatientRecord.silence` lets the database result override it.

The `gap` layer is an engagement signal, not a clinical one. It never raises a condition above `monitor`
on its own, and it also marks that patient's trends as **stale** ("last reading 12 days ago") so absence of
data is never shown as stability.

## 7. Flag object

```ts
type Flag = {
  id: string; patientId: string;
  condition: "t2d" | "ckd" | "htn" | "masld" | "mets" | "osa" | "engagement";
  kind: "threshold" | "trend" | "score" | "symptom_cluster" | "changepoint" | "cooccurrence" | "sleep" | "gap";
  severity: "monitor" | "review" | "urgent";
  title: string;                 // "HbA1c projected to reach 6.5% in ~7 months"
  points: number;                // sum of contributions
  contributions: Contribution[]; // the why panel (§6)
  evidence: { metric: string; ts: string; value: number; unit: string }[];
  rule: string;                  // human readable rule that fired
  sourceIds: string[];           // keys into sources.ts
  status: "new" | "validated" | "dismissed";
  clinicianNote?: string;
};
```

`kind` is the layer that created the flag (the biggest contributor); the other layers still appear in
`contributions`. Persisting: the `flags` table gains `points int` and `contributions jsonb`.

`evaluate(record)` (`evaluate.ts`) returns one ledger per condition (`contributions`, `points`, `severity`, `basis`,
`diagnostic`), the active red flags, the patient severity and the silence info; T-024 turns ledgers with a
severity into `Flag` objects. `buildRecord` (`record.ts`) builds the input from database or seed rows.

Patient risk rank for the clinician list = max severity, then total points across open flags, then the
steepest normalized slope. A `gap` flag alone never outranks a clinical flag.

## 8. Where the math runs (Tiger Data)

| Computation | Where | How |
|---|---|---|
| Vitals slope, R², crossing date | Tiger Data continuous aggregates | store `stats_agg(value, epoch_days)` per patient and metric in `obs_daily` / `obs_weekly`; `rollup()` over the 30 or 90 day window; read `slope()`, `determination_coeff()`, `intercept()` |
| Crossing date | same aggregate | `x_intercept()` on an aggregate of `value − threshold` for each monitored threshold, or equivalently `(threshold − intercept()) / slope()`. Pick one in T-007 and record it |
| Patients who stopped logging | Tiger Data `heartbeat_agg` | one heartbeat per patient per logged observation, rolled up per day; a patient is **silent** when they were active (logged on ≥ 50% of the prior 30 days) and have no heartbeat for ≥ 7 days; `dead_ranges()` lists the gaps. Tune the liveness interval so a single skipped day is not a gap |
| Lab Mann-Kendall + Sen | engine (TypeScript) | 4 to 10 rows per patient, rank-based, no aggregate needed |
| CUSUM, baseline z-score | engine (TypeScript) | reads `obs_daily` rows |

Notes:
- `stats_agg`, `x_intercept` and `heartbeat_agg` come from the `timescaledb_toolkit` extension. Confirm it is
  installed on Tiger Cloud and in the local image (T-002) and **verify the exact function signatures against
  the toolkit docs** before writing the SQL.
- The SQL result must match a pure-TypeScript OLS on the same seed data (test in T-007), so the database
  is an optimization and not a second source of truth.
- Silent patients are a clinician-facing item. Any outreach to the patient still goes through validate
  (CLAUDE.md §4): the AI never messages a patient directly.

## 9. Scale mode and benchmark

The demo dataset stays ~25 patients. For the Tiger Data story we add a **scale mode** and a page that
measures it.

- **Seed:** `npm run db:seed -- --scale 1000` generates 1,000 patients from the same seeded RNG, so every
  teammate gets identical data. Story patients A/B/C keep fixed ids. The rest are drawn from archetypes
  with a fixed mix (starting point: 70% stable, 15% slow drift, 5% rapid decline, 5% silent, 5% metabolic
  cluster) so the queue is not all red. Use `COPY` for inserts. About 1,000 patients × 90 days × ~6 vitals
  ≈ 540k observation rows plus labs. Every row keeps `source = 'synthetic'`.
- **Benchmark page** (`/benchmark`, labeled "Synthetic scale test"): runs a fixed set of operations on
  whatever dataset is loaded, shows patient and row counts, and reports the **median of 5 warm runs** in ms
  for each path:
  1. Continuous aggregate + `stats_agg` (the Tiger Data path)
  2. The same query over raw `observations` (no aggregate)
  3. Fetch raw rows and compute in TypeScript
  Operations: slope + R² + crossing for all patients, the silent-patient scan, and a full engine re-run
  for every patient. Numbers are measured live, never hard-coded; any figure on a slide comes from this page.

## 10. Gemini prompts (src/ai)

All calls request JSON matching a zod schema and are validated. On failure, retry once, then store
the raw input with `confidence = 0` and surface it as "needs manual entry".

- `extractMeal(photo)` -> items, estimated kcal, carbs/protein/fat/fibre g, sodium mg, confidence
- `extractDevice(photo)` -> device type, readings with units, timestamp if visible
- `extractLabs(pdf|photo)` -> lab name, value, unit, reference range, collection date. Convert to SI.
  Lipids (triglycerides, HDL) are in scope now: they feed metabolic syndrome and FLI.
- `codeSymptoms(text)` -> symptom codes from the fixed list + severity + red-flag boolean
- `explainFlag(flag, contributions, sources)` -> 3 sentence clinician summary. **May cite only the given
  sources and may not change points.**
- `visitSummary(patient, window)` -> bullet summary for appointment prep

The sleep check-in is a fixed form, not a Gemini call.
