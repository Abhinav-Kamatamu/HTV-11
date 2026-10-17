# Risk engine

The engine is the credible core of the project. It is deterministic, unit tested, and every
output points at a source. Gemini sits on either side of it (extraction in, explanation out),
never in the middle.

```
raw input ──Gemini extract──> observations ──engine──> flags + evidence ──Gemini explain──> clinician text
(photo, PDF, chat)            (typed, unit, confidence)  (rules, scores, trends)   (cites only sources.ts)
```

> **Verify every number below against its source before coding it** (task T-020). These are
> starting points gathered quickly, not a clinical reference. Put the verified value and URL in
> `src/engine/sources.ts`.

## 1. Observations

Everything becomes a row: `(patient_id, ts, metric, value, unit, source, confidence)`.
`source` is one of `lab`, `device_photo`, `meal_photo`, `chat`, `intake`, `manual`, `synthetic`.
Low-confidence extractions (e.g. meal estimates) can feed trends but never fire a flag alone.

## 2. Validated scores and thresholds (Canadian guidelines where possible)

| Condition | Inputs | Rule (to verify) | Source to cite |
|---|---|---|---|
| Type 2 diabetes | HbA1c | prediabetes 6.0 to 6.4%, diabetes ≥ 6.5% | Diabetes Canada CPG |
| | Fasting plasma glucose | prediabetes 6.1 to 6.9 mmol/L, diabetes ≥ 7.0 | Diabetes Canada CPG |
| | CANRISK questionnaire | 0 to 32 low/moderate, 33 to 42 high, ≥ 43 very high | PHAC CANRISK, CTFPHC |
| Chronic kidney disease | eGFR (CKD-EPI 2021) | < 60 sustained > 3 months = G3a+ | KDIGO |
| | eGFR slope | decline > 5 mL/min/1.73m²/yr = rapid | KDIGO |
| | Urine ACR | ≥ 3 mg/mmol = A2 | KDIGO |
| Hypertension | Home BP average (≥ 7 days) | ≥ 135/85 | Hypertension Canada |
| Fatty liver / fibrosis | FIB-4 = age × AST / (platelets × √ALT) | < 1.30 low, > 2.67 high (age > 65: lower cutoff 2.0) | AASLD / EASL MASLD guidance |
| | Fatty Liver Index (TG, BMI, GGT, waist) | ≥ 60 suggests steatosis | Bedogni 2006 |

## 3. Trend math (the differentiator)

For each metric with enough points:

- **Slope:** ordinary least squares over the window (labs: all history, vitals: 30 to 90 days).
  Report slope per year with a simple confidence interval.
- **Projected crossing:** if the slope points toward a threshold, `days_to_cross = (threshold - last_fit) / slope`.
  Only show when the fit is decent (R² ≥ 0.5 and ≥ 3 points) and the crossing is within 3 years.
- **Personal baseline deviation:** z-score of the last 7-day mean vs the patient's own prior 60 days
  (weight, resting HR, home BP, steps, sleep). Catches change that is normal for the population but not for them.
- **Change-point (stretch):** CUSUM on daily vitals to mark "something changed around Sep 3".

A trend flag fires when a metric is still inside the normal range but its projection crosses a threshold
within the horizon. This is the "each result looked normal" story.

## 4. Symptom weighting (the chat)

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

## 5. Flag object

```ts
type Flag = {
  id: string; patientId: string;
  condition: "t2d" | "ckd" | "htn" | "masld";
  kind: "threshold" | "trend" | "score" | "symptom_cluster";
  severity: "monitor" | "review" | "urgent";
  title: string;                 // "HbA1c projected to reach 6.5% in ~7 months"
  evidence: { metric: string; ts: string; value: number; unit: string }[];
  rule: string;                  // human readable rule that fired
  sourceIds: string[];           // keys into sources.ts
  status: "new" | "validated" | "dismissed";
  clinicianNote?: string;
};
```

Patient risk rank for the clinician list = max severity, then number of open flags, then the steepest
normalized slope.

## 6. Gemini prompts (src/ai)

All calls request JSON matching a zod schema and are validated. On failure, retry once, then store
the raw input with `confidence = 0` and surface it as "needs manual entry".

- `extractMeal(photo)` -> items, estimated kcal, carbs/protein/fat/fibre g, sodium mg, confidence
- `extractDevice(photo)` -> device type, readings with units, timestamp if visible
- `extractLabs(pdf|photo)` -> lab name, value, unit, reference range, collection date. Convert to SI.
- `codeSymptoms(text)` -> symptom codes from the fixed list + severity + red-flag boolean
- `explainFlag(flag, evidence, sources)` -> 3 sentence clinician summary. **May cite only the given sources.**
- `visitSummary(patient, window)` -> bullet summary for appointment prep
