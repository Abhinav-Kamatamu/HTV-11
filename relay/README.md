# relay/

One baton file per lane. Read by `/pickup`, written by `/handoff` and `scripts/handoff.sh`.

Sections (keep the headings exactly, the scripts parse them):

- **Status**: where the lane stands, first line is shown in the lane summary
- **In flight**: the task a session was working on when it stopped. Written *before* starting a task.
  Non-empty here means "a session may have died mid-task, inspect before continuing"
- **Next up**: 1 to 3 steps a fresh session can start immediately
- **Gotchas**: hard-won knowledge
- **Log**: handoff history, newest first, appended by `scripts/handoff.sh`

To add a lane: copy any lane file, reset it, add the lane to the table in `TASKS.md`, and add its
folders to `lane_paths()` in `scripts/pickup.sh`.
