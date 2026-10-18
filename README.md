# Ripple

> "Each result looked normal. The trend didn't."

A patient's HbA1c can read 4.65, 4.8, 4.95, 5.1, 5.25, 5.4 across three years — every single result
under the lowest clinical cutoff, so every one gets filed as normal. Charted together, that patient
reaches prediabetes in about two years. Ripple is a risk tool for primary care built at Hack the
Valley 11: patients log low-effort signals (a meal photo, a BP-cuff photo, a one-line symptom chat,
a weekly sleep check-in), a deterministic, cited risk engine watches the *trends* no single visit
would catch, and a clinician — never the AI — decides what to act on.

**[Live demo](https://cleanbillof.health)** · **[Devpost](pitch/DEVPOST.md)** · **[Architecture](docs/ARCHITECTURE.md)** · **[Spec](docs/SPEC.md)**

- **Clinician queue**, ranked by risk trajectory, with a "stopped logging" badge and a points-ledger
  "why" panel — every flag cites the guideline that triggered it (Diabetes Canada, KDIGO,
  Hypertension Canada, CANRISK, among others), never a free-floating AI opinion.
- **Population scan**: every patient's trend and who's gone quiet, checked at once, computed live
  inside Tiger Data (TimescaleDB continuous aggregates + `heartbeat_agg`), not precomputed for show.
- **Patient side**: snap a meal, a device screen, or a lab report; Gemini turns the photo into
  structured readings. The engine scores it. Gemini never sets the score, only explains it, and only
  ever cites from a fixed source list.
- All data is synthetic. This is a hackathon prototype, not a medical device.

Start with `docs/SPEC.md` (what and why), then `docs/ARCHITECTURE.md` (how), or the write-up in
`pitch/DEVPOST.md` / `pitch/DEV_POST.md`.

## The relay: how four Claude Pro accounts share one build

The rest of this README is about how the team built it, not what it does — see above for that.

Work is split into **lanes** (`core`, `engine`, `clinician`, `patient`, `pitch`). Each lane has a
baton file in `relay/<lane>.md` saying what's done, what was in flight, and what's next. Any teammate's
Claude Code session can pick up any lane from that file alone.

### First time setup (each teammate, once)

```bash
git clone <repo-url> ripple && cd ripple
git config user.name "<your name>"
cp .env.example .env.local     # fill in from the team chat
claude                          # open Claude Code here; the session hook shows lane status
```

Windows: run the scripts from Git Bash or WSL.

### Starting a session

In Claude Code: `/pickup <lane>` (e.g. `/pickup engine`).
Without Claude: `scripts/pickup.sh <lane>`.

### When your Claude limit is about to hit

In Claude Code: `/handoff <lane>`. It writes the baton and pushes.

### When your Claude limit already hit (session dead)

You still have a terminal. Run:

```bash
scripts/handoff.sh <lane> "limit hit, <what you were doing>"
```

That commits everything on disk, logs the handoff with the list of touched files, and pushes. Then
post in the team chat: "`<lane>` is free". The next person runs `/pickup <lane>`, and Claude inspects
the half-finished work before continuing.

### Rules that keep this working

1. Claim a task (TASKS.md + "In flight" + push) **before** coding. A claim is what lets the next
   session understand a dead session's half-done work.
2. Commit small and often. Push with `git pull --rebase --autostash && git push`. No force pushes.
3. Stay in your lane's folders (table in TASKS.md).
4. Secrets only in `.env.local`. `handoff.sh` refuses to commit env files.

## Run locally (once T-001 to T-004 are done)

Get `DATABASE_URL` (the shared Tiger Cloud service) from team chat and put it in `.env.local`
(see `.env.example`). There is no local database.

```bash
npm install
npm run db:migrate && npm run db:seed
npm run dev
```
