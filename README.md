# Undertow

Hack the Valley 11. Silent-killer early warning for primary care: patients log low-effort signals,
a cited risk engine watches the *trends*, and clinicians decide what to act on.

> "Each result looked normal. The trend didn't."

Start with `docs/SPEC.md` (what and why), then `docs/ARCHITECTURE.md` (how).

## The relay: how four Claude Pro accounts share one build

Work is split into **lanes** (`core`, `engine`, `clinician`, `patient`, `pitch`). Each lane has a
baton file in `relay/<lane>.md` saying what's done, what was in flight, and what's next. Any teammate's
Claude Code session can pick up any lane from that file alone.

### First time setup (each teammate, once)

```bash
git clone <repo-url> undertow && cd undertow
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
