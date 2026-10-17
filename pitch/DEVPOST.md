# Ripple

Each result looked normal. The trend didn't.

> Paste into Devpost. Remaining placeholders: none for numbers. Avoid underscores in the text: Devpost's markdown eats them (stats_agg became italic mush).
> Tracks to enter, in order: PointClickCare Catch It Early, Healthcare Innovation, AI for Social Impact, Gemini, Tiger Data, Vultr, GoDaddy.

## Inspiration

A patient has six HbA1c results over three years: 4.65, 4.8, 4.95, 5.1, 5.25, 5.4. Each is below the lowest cutoff, so each was filed as normal. Charted together, the patient reaches prediabetes in about 2 years. Care teams see signals one at a time, if at all. Ripple combines them and tells the care team who to look at first, and why.

## What it does

### For the care team
- Patients are ranked by risk trajectory, with a "stopped logging" badge.
- Each flag has a points ledger: every signal, its points, its reading and a guideline citation.
- Lab charts show projected threshold dates, and BP charts mark where a shift began.
- Metabolic syndrome appears as "3 of 5 criteria, 2 unknown".
- A clinician validates or dismisses every flag. The AI never messages a patient on its own.

### For the patient
- Snap a meal, a BP monitor screen or a lab report, or type how you feel.
- Do a weekly sleep check-in and see a timeline and messages from the care team.

## How it works

- Risk engine: checks each patient against Canadian health guidelines and looks at whether their results are trending toward a problem. Fixed rules, not AI, decide who gets flagged.
- Gemini: reads photos and typed notes into data, and writes a short explanation for the clinician. It never scores anyone.
- Tiger Data: stores every reading and does the trend math inside the database, so the queue stays fast. It also spots patients who stopped logging. On our demo data it ran about 3x faster than doing the math in the app (33 ms vs 116 ms).
- Vultr: hosts the app on a Toronto server and re-checks every patient each night.
- All data is synthetic.

## What we learned

- Clinicians act on flags they can check in 30 seconds, so the explanation matters more than the score.
- Four to six irregular lab points needs robust stats, not plain regression.
- Keeping the AI out of the decision made the system easier to trust and to test.

## What's next

- Care-home mode: staff log meal-tray photos and notes into the same engine.
- More risk types, such as falls and medication adherence.
- Validate on de-identified real data and measure how early we flag.

## Built with

nextjs, typescript, react, tailwind-css, gemini, timescaledb, postgresql, drizzle, vultr, docker, vitest

## Try it out

[live demo](https://cleanbillof.health), [GitHub repo](https://github.com/Abhinav-Kamatamu/HTV-11)
