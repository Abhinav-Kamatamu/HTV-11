---
description: Write the relay baton and push, so another teammate's session can continue
argument-hint: <lane> [optional note]
---

Hand off the lane named by the first word of: **$ARGUMENTS**. Be fast: the session may be close to its limit.

1. Edit `relay/<lane>.md`:
   - **Status:** one or two lines on where the lane stands overall.
   - **In flight:** if a task is unfinished, say exactly what is done, what is not, and which
     file/function to open first. Otherwise `(none)`.
   - **Next up:** 1 to 3 concrete next steps a fresh session can start on without asking anyone.
   - **Gotchas:** anything learned the hard way (env quirks, failing tests and why, API shapes).
     Keep existing gotchas that still apply.
2. Update `TASKS.md` statuses for this lane (`done`, or leave `doing` if In flight).
3. Add any new decisions to `docs/DECISIONS.md`.
4. Run `scripts/handoff.sh <lane> "<one line summary>"` (include my optional note if I gave one).
5. Report the push result in one line. If it failed, show the script's instructions.

Do not start new work in this command.
