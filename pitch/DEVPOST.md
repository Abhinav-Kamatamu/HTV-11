# Devpost template: Undertow

> Internal notes are in blockquotes like this one. Delete them before pasting into Devpost.
> Everything else is draft copy you can paste. `TODO(T-083)` marks numbers we have to measure live.
> Don't put any number on Devpost that we didn't measure.

---

## Judging cheat sheet (internal, don't paste)

> PointClickCare "Catch It Early" scores five things. Each one needs a sentence in the write-up
> *and* a moment in the demo:
>
> | Criterion | Our one-line answer | Where judges see it |
> |---|---|---|
> | **Usefulness** | Flags the patient whose results are all "normal" but whose trend says prediabetes in ~2 years | Patient A HbA1c chart (demo beat 1) |
> | **Clarity** (+ bonus "explain why") | Every flag has a points ledger: one line per signal, its reason and a guideline citation | Why panel (beat 2) |
> | **Creativity** | Combines weak signals (sub-threshold labs + symptoms + home BP + going quiet) instead of waiting for one value to cross a line | Patient B CUSUM marker, Patient C 3-of-5 (beats 3, 5) |
> | **Execution** | Live on Vultr Toronto, real photo input on stage, measured benchmark | Beats 4 and 6 |
> | **Use of AI** | Gemini turns messy input (meal photos, BP monitor screens, lab PDFs, chat) into structured data and writes explanations. Deterministic, tested statistics decide the risk | Beat 4 + why panel |
>
> **Framing risk:** the challenge talks about nursing homes and senior living. Our primary user is a
> primary-care clinician. Lead with "care team", and use "What's next" to show that the same signals
> (skipped meals from tray photos, a resident going quiet, symptom notes from CNAs) carry over directly to a care home.
> Don't claim we built care-home mode unless we did.

---

## Tagline (≤ 60 chars)

**Each result looked normal. The trend didn't.**

## Inspiration

Six HbA1c results over three years: 4.65, 4.8, 4.95, 5.1, 5.25, 5.4. Every one is below Diabetes
Canada's lowest cutoff, so every one got filed as "normal." Put them on one chart and the patient is
on track to reach prediabetes in about two years.

Chronic disease doesn't usually show up as one bad reading. It shows up as small signals that never
meet: a creeping lab value, more thirst and fatigue in a symptom note, a home BP that drifted up in
September, a patient who quietly stopped logging. A busy care team sees each signal on its own, if
they see it at all. We built the tool that puts them together.

## What it does

Undertow is an early-warning dashboard for the care team.

- **A risk-ranked queue.** Patients are sorted by *trajectory*, not by their latest value. A "stopped
  logging" badge picks out people who went quiet.
- **It explains every flag.** Each flag opens a **points ledger** with one line per signal: what fired,
  how many priority points it added, the readings behind it and a citation (Diabetes Canada, KDIGO,
  Hypertension Canada, STOP-Bang, ...). The total sets the severity. No black box.
- **It catches weak signals that only matter together:**
  - Lab trends that are still "normal" but heading toward a threshold, with a projected crossing date and range
  - Change points in home vitals ("BP shifted up around Sep 3")
  - Metabolic syndrome as 3 of 5 criteria, with unknown criteria shown as unknown rather than guessed
  - Symptom patterns building up over weeks from free-text check-ins
  - Patients who stopped logging
- **Logging is low-effort for patients.** They snap a meal, a BP monitor screen or a lab report, or
  just type "really thirsty today." AI turns that into structured data.
- **A clinician stays in the loop.** The AI never alerts a patient directly. A clinician validates or
  dismisses each flag, and only a validated flag can send the patient a message.

## How we built it

> Keep this concrete. Judges who score "Use of AI" want to know exactly where the AI sits.

**The risk engine decides, and the LLM explains.**

- **Risk engine** (TypeScript, pure functions, `TODO: N` unit tests): validated clinical scores
  (CANRISK, FIB-4, eGFR/ACR staging, STOP-Bang), Mann-Kendall + Sen's slope for sparse lab series,
  CUSUM change-point detection on daily vitals, and a capped per-layer points system that turns
  everything into one ranked severity. Every threshold is checked against its source and stored in
  one citation list.
- **Gemini** handles the messy edges: multimodal extraction from meal photos, device screens and lab
  PDFs; coding free-text symptoms; and plain-language explanations of a flag. Explanations are
  limited to the engine's own ledger and citation list, so Gemini can't invent a score or a source.
- **Tiger Data (TimescaleDB):** observations live in a hypertable. Continuous aggregates with
  `stats_agg` compute vitals slopes, R² and threshold crossings inside the database, and
  `heartbeat_agg` finds patients who stopped logging. On a 1,000-patient synthetic scale test:
  `TODO(T-083): continuous aggregate X ms vs raw table Y ms vs app-side Z ms`.
- **Vultr:** deployed in the **Toronto** region so patient data stays in Canada, with a nightly job
  that re-runs the engine for every patient. Silence and projections depend on how much time has
  passed, not on new data, so someone who goes quiet still gets flagged.
- **Stack:** Next.js, TypeScript, Tailwind, shadcn/ui, Drizzle, Vitest.
- **Data:** 100% synthetic, generated by a deterministic seeded generator (story patients + controls,
  and a 1,000-patient scale mode), and labeled synthetic in the UI.

## Challenges we ran into

> Pick 2 or 3 real ones. These are good candidates:

- **Statistics on very little data.** Labs come twice a year. Linear regression on 4 to 6 irregular
  points isn't reliable, so we used Mann-Kendall + Sen's slope with an exact p-value and refuse to call
  a trend below 4 points.
- **Not over-alarming.** A tool that flags everyone gets ignored. We capped each layer, showed
  "unknown" instead of guessing, and Patient C is deliberately rated "monitor," not "urgent."
- **Keeping the LLM honest.** We drew a hard line between extraction/explanation (Gemini) and
  decisions (the engine), then wrote tests to keep it there.

## Accomplishments we're proud of

- Every flag can be traced from the score back to the raw reading and the guideline behind it.
- A live photo of a BP monitor taken on stage moves a patient's score in seconds.
- The 1,000-patient benchmark measures its numbers live; none are hard-coded. `TODO(T-083)`

## What we learned

- In early detection, *explainability is the product*. Clinicians act on a flag they can check in
  30 seconds, not on a score.
- Simple, well-cited statistics plus AI at the edges beat an end-to-end model when you need trust.

## What's next

- **Care-home mode:** CNAs log meal-tray photos and quick notes for residents, so skipped meals,
  confusion and reduced mobility feed the same engine and the same why panel.
- More risk layers (falls, medication adherence), each with a cited rule.
- Validate on real (de-identified) cohorts and measure lead time: how many days earlier we flag than
  a diagnosis would.

## Built with

`nextjs` `typescript` `react` `tailwindcss` `shadcn-ui` `gemini` `timescaledb` `tiger-data`
`postgresql` `drizzle` `vultr` `vitest` `docker`

## Links

- Live demo: `TODO(T-015): GoDaddy domain` (Vultr Toronto)
- GitHub: `TODO`
- Video (≤ 3 min): `TODO(T-082)`

## Media checklist (internal)

> - [ ] Cover image: Patient A's HbA1c chart with the projection line. That's our hook, so it goes first
> - [ ] Why-panel screenshot showing the points ledger and citations
> - [ ] Architecture diagram (T-080, `pitch/architecture.svg`)
> - [ ] Patient B BP chart with the CUSUM marker
> - [ ] `/benchmark` bar chart
> - [ ] Phone screenshot of the photo upload
> - [ ] Prize tracks entered, in priority order: PointClickCare, Healthcare, AI for Social Impact, then the MLH tracks (Gemini, Tiger Data, Vultr, GoDaddy)
