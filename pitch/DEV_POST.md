---
title: The AI Never Sets the Risk Score: Building Ripple at Hack the Valley
published: false
tags: ai, healthcare, typescript, hackathon
cover_image: [ ]
---

> Paste into DEV (markdown mode). Remaining `[ ]`: cover image, Devpost link. Then flip `published: true` and add the DEV challenge tag after the event. Synthetic data only.

A patient has six HbA1c results over three years: 4.65, 4.8, 4.95, 5.1, 5.25, 5.4. Every one is below the lowest cutoff, so every one was filed as normal. Charted together, they reach prediabetes in about two years.

That is the idea behind **Ripple**, which we built at Hack the Valley 11: a risk tool for primary care that watches trajectories, not single values. This post is about the design choice that shaped everything else. **The deterministic engine decides. The LLM only works at the edges.**

## The rule: Gemini never invents a score

It is tempting to hand a model the whole chart and ask "is this patient at risk?" We did not, for three reasons.

1. **A clinician cannot check a vibe.** A flag is only useful if a physician can verify it in about 30 seconds.
2. **You cannot unit test a free-text answer.** You can test `FIB-4(age, AST, ALT, platelets)`.
3. **Fluent text can be wrong.** In medicine, a wrong citation does more harm than no citation.

So the pipeline looks like this:

```
photo / PDF / chat -> Gemini extracts -> typed observations
  -> deterministic engine (rules, scores, trends) -> flags + points ledger
  -> Gemini explains, citing only sources from a fixed list -> clinician
```

Gemini appears twice, once turning messy input (a photo of a BP cuff, a lab PDF, "bit of a headache, really thirsty today") into structured readings, and once turning the engine's output into readable prose. It never touches the middle. The explainer may only cite entries from `src/engine/sources.ts`, a fixed list of Canadian guidelines (Diabetes Canada, KDIGO, Hypertension Canada, CANRISK and others), each marked `primary`, `secondary` or `convention` depending on how directly we read it.

## What the engine does

All of it is plain TypeScript with Vitest tests (hundreds, all green).

- **Validated scores:** CANRISK, FIB-4, eGFR and ACR staging, STOP-Bang, and metabolic syndrome counted as "3 of 5 criteria, 2 unknown".
- **Lab trends:** a patient has four to ten irregular lab points over several years. Ordinary least squares on five points is fragile, and one haemolysed sample can swing the line. We use **Mann-Kendall** for the trend test and **Sen's slope** for the rate, both rank-based. A trend only counts at n ≥ 4 and p < 0.10, and the projected threshold date comes with a range, not a single number.
- **Vitals:** dense daily data (home BP, weight, sleep) is fitted with regression inside the database, and **CUSUM** marks where a shift began ("around Sep 3").
- **Silent patients:** someone who stops logging is a signal too. The queue shows a "stopped logging" badge.

Every flag carries a **points ledger**: one line per signal, with its points, the reading that triggered it and a citation. Points are priority points, not a probability. The ledger is the answer to "why is this patient at the top?"

## The model proposes, the clinician disposes

The patient never gets a risk alert from the AI. A clinician validates or dismisses each flag, and only a validated flag can trigger a message to the patient. We treated that as a product requirement, not a nicety. It also made the system easier to build, because the AI had no path to cause harm directly.

## Small things that paid off

- **Push math into the database.** Tiger Data (TimescaleDB) hypertables and continuous aggregates (`stats_agg`, `heartbeat_agg`) compute slopes and find silent patients next to the data. On our live demo data (25 patients, 12,900 vitals rows) the fit for every patient takes about 33 ms from the continuous aggregate versus 116 ms fetching rows and computing in TypeScript (median of 5 runs).
- **Keep data in Canada.** We deployed to Vultr Toronto and run a nightly job that re-evaluates every patient. It has to be a job: silence and trend ageing depend on time passing, not on new events, so nothing else would re-trigger them.
- **Decide units once.** Everything is Canadian/SI (mmol/L, µmol/L, mg/mmol). One unit mistake in a clinical tool is worse than a missing feature.
- **Run `next build`, not just tests.** Three of our pages passed every unit test and failed the production build under Next 16, because they read `searchParams` outside a Suspense boundary.

## What we learned

- Clinicians act on what they can verify, so the explanation matters more than the score.
- Keeping the AI out of the decision made the system more trustworthy and easier to test.
- Constraining a model to a fixed citation list is cheap and removes a whole class of failure.

## What's next

Care-home mode (staff log meal-tray photos into the same engine), more risk types such as falls and medication adherence, and validation against de-identified real data to measure how early we flag.

Everything here uses synthetic data and is a hackathon prototype, not a medical device.

**Links:** [live demo](https://cleanbillof.health) · [GitHub repo](https://github.com/Abhinav-Kamatamu/HTV-11) · [Devpost]
