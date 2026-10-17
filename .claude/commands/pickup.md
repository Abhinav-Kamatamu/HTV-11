---
description: Pick up a lane from the relay baton (run at the start of every session)
argument-hint: <lane: core | engine | clinician | patient | pitch>
---

Resume the **$ARGUMENTS** lane.

1. Run `scripts/pickup.sh $ARGUMENTS`. If no lane was given, run `scripts/pickup.sh`, show me the
   lane summary, and ask which lane I'm taking. Stop there until I answer.
2. Read the printed baton carefully. Then read `TASKS.md` and only the `docs/` files the next task needs.
3. If **In flight** is not "(none)", the last session died mid-task. Inspect `git status`, `git diff`,
   and the last few commits, tell me in 2 or 3 lines what state that work is in, and propose how to
   finish or repair it.
4. Otherwise propose the next task from **Next up** / `TASKS.md` with a short plan.
5. Wait for my go-ahead, then claim the task exactly as CLAUDE.md §2 says (TASKS.md `doing`,
   In flight plan, commit + push the claim) before writing code.
