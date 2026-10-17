# Idea review (pre-build, 2026-10-17)

Review of the original idea (notes + voice memo), and what changed in SPEC.md because of it.

## Rating

| | As pitched | After the changes in SPEC.md |
|---|---|---|
| Problem / impact | 9 | 9 |
| Novelty | 5 | 7 |
| Feasibility in a weekend | 3 | 7 |
| Demo strength | 5 | 8 |
| Prize stacking | 7 | 8 |
| **Overall** | **6 / 10** | **8 / 10** |

## Strengths

- Real, well-chosen problem. Silent killers are slow, and the observation that most patient data
  never reaches the doctor is true and easy to explain.
- Two-sided product (patient + clinician) gives a strong demo arc: input on one side, decision on the other.
- Clinician validation before notifying the patient is ethically right and exactly what health judges look for.
- "AI must justify and cite" maps directly onto PointClickCare's bonus criterion.
- The symptom weighting question ("how much is a minor headache worth?") is a genuinely good design question.

## Weaknesses

1. **Scope.** Food photos, body photos, symptom chat, lab records, appointment recording, sleep, doctor hub,
   alerts, citations. That is several products. Unscoped, it ends as many half-working screens.
2. **Food photo macros are the weakest signal and the most crowded space.** Calorie-from-photo apps
   already exist and are known to be rough. It can't be the headline.
3. **"Let the AI find the patterns" is not credible on its own.** Judges will ask how it decides. An LLM
   reading a pile of data and announcing a disease risk sounds like hallucination risk.
4. **"Collect as much data as possible" / record every appointment** reads as surveillance. In Ontario
   (PHIPA) and to health judges it is a liability, not a feature. AI scribes for visits already exist.
5. **Physique/"growth" photos** have no clinical anchor and are invasive.
6. **Time mismatch for PCC.** Silent killers develop over years, which a 36-hour demo can't show live,
   and PCC's examples are care settings and days-before-emergency signals.

## What changed (and why)

- **Deterministic, cited risk engine** (CANRISK, FIB-4, KDIGO eGFR/ACR, Hypertension Canada home BP) +
  **trend projection** is the core. Gemini extracts and explains, never decides. Fixes 3, strengthens explainability.
- **Headline = "each result looked normal, the trend didn't."** Projection lines on years of labs. Fixes the
  novelty problem and gives the demo one memorable chart.
- **Synthetic multi-year data** (PCC explicitly allows it) solves the time mismatch (6).
- **New low-effort, hardware-free inputs:** photo of any device screen (BP cuff, glucometer, scale) and
  lab report PDFs. Home BP is the most important silent-killer signal and costs the patient one photo.
- **Cut** body photos and appointment recording, collect only what feeds a score (4, 5). Meal photos stay
  as one input with a confidence level (2).
- **Symptom chat kept,** with a transparent decayed weight formula the clinician can see.
- **Red-flag symptoms bypass the AI** and tell the patient to seek care now.

## Other tracking ideas considered

- Waist circumference monthly (better than BMI for metabolic risk, feeds CANRISK and FLI) - **in MVP**
- Phone step count / sleep via Health Connect or Apple Health export - stretch
- Grocery receipt photos for diet pattern - stretch, far lower effort than per-meal photos
- Care home mode: tray photo before/after -> % eaten - stretch, aimed at PCC
- Medication adherence check-ins - stretch
