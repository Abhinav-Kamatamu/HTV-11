# CLAUDE.md

You are one of several Claude Code sessions building **Ripple** for Hack the Valley 11.
Four teammates share this repo. Each has Claude Pro, and any session can hit its usage limit
mid-task with no warning. Another teammate's session must be able to pick up exactly where
you stopped. Everything below exists to make that possible.

## 1. Start of every session (do this before anything else)

1. Run `scripts/pickup.sh <lane>` (or the `/pickup <lane>` command). If the human did not
   say which lane, run `scripts/pickup.sh` with no argument, show the lane summary, and ask.
2. Read, in order: `relay/<lane>.md`, `TASKS.md`, then only the docs your task needs:
   - `docs/SPEC.md` for what we are building and what is out of scope
   - `docs/ARCHITECTURE.md` for stack, folders, data model, API
   - `docs/RISK_ENGINE.md` for the scoring/trend logic and the citation rules
   - `docs/DECISIONS.md` before changing anything already decided
3. If `relay/<lane>.md` has an **In flight** entry, the previous session died mid-task.
   Check `git log -5` and `git status`, finish or repair that work first, then continue.

## 2. While working (the part that actually saves us)

Assume you can be cut off at any moment. Work in small, committed steps.

- **Claim before you start.** Set the task to `doing` with your lane in `TASKS.md`, and write a
  2 to 4 line plan under **In flight** in `relay/<lane>.md`. Commit and push that claim
  (`git commit -m "relay(<lane>): claim T-0xx"`). This costs seconds and tells the next
  session what was half done.
- **Commit early.** Commit every time something works, at least every ~20 minutes of work.
  Message format: `<lane>: <what changed> (T-0xx)`.
- **Push with rebase.** `git pull --rebase --autostash && git push`. Never force push.
  Never rewrite history on `main`.
- **Update the baton as you go,** not only at the end. After each finished task: move it to
  `done` in `TASKS.md`, clear **In flight**, refresh **Next up** and **Gotchas** in
  `relay/<lane>.md`, commit, push.
- **Stay in your lane's folders** (see the lane table in `TASKS.md`). If you must touch another
  lane's files, keep the change minimal and say so in that lane's relay file under Gotchas.
- **Record decisions.** Any choice another session could reasonably undo (library, schema,
  API shape, threshold) gets one line in `docs/DECISIONS.md`.
- **Never commit secrets.** Keys live in `.env.local` (git-ignored). New env vars go in
  `.env.example` with a comment.

## 3. End of session / before the limit

If the human says they are near their limit, or says "hand off", run `/handoff <lane>`.
That updates `relay/<lane>.md` (status, in flight, next up, gotchas, log entry) and runs
`scripts/handoff.sh <lane> "<one line summary>"`, which commits everything and pushes.

If the session dies before that, the human runs `scripts/handoff.sh <lane> "limit hit"`
themselves. It commits whatever is on disk as WIP and records the diff stat, so nothing is lost.

## 4. Product guardrails (from docs/SPEC.md, repeated because they matter)

- The **risk engine decides, the LLM explains.** Flags come from deterministic, cited rules
  and trend math in `src/engine`. Gemini extracts structure from messy input (photos, PDFs,
  free text) and writes explanations. It never invents a risk score.
- **Every flag carries evidence:** the readings that triggered it, the rule or score used, and
  a citation from `src/engine/sources.ts`. Gemini may only cite sources from that list.
- **Clinician in the loop.** The patient never receives a risk alert directly from the AI.
  A clinician validates or dismisses, and only a validated flag can trigger a patient message.
- **Units are Canadian/SI:** glucose in mmol/L, HbA1c in %, creatinine in µmol/L, eGFR in
  mL/min/1.73m², ACR in mg/mmol, weight in kg, waist in cm.
- **Demo data is synthetic** and labeled as such in the UI.
- Demo first. If a feature cannot be shown in the 3-minute demo (`docs/SPEC.md` §6), it waits.

## 5. Conventions

- TypeScript strict. Prefer small pure functions in `src/engine` with unit tests (Vitest).
- Run `npm run lint && npm test` before pushing anything in `src/engine` or `src/db`.
- Don't add a dependency without a line in `docs/DECISIONS.md`.
- Keep this file short. Project knowledge goes in `docs/`, session state goes in `relay/`.
