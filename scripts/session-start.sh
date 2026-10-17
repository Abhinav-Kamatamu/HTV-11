#!/usr/bin/env bash
# Claude Code SessionStart hook. Its stdout is added to Claude's context.
# Read-only: fetches, reports how far behind we are, summarizes lanes. Never pulls or commits.
ROOT="$(cd "$(dirname "$0")/.." && git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT" || exit 0

echo "[relay] Undertow repo. Follow CLAUDE.md section 1 before doing anything else."
T=""; command -v timeout >/dev/null && T="timeout 8"   # macOS has no timeout by default
if git remote | grep -q . && $T git fetch --quiet 2>/dev/null; then
  UP="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"
  if [ -n "$UP" ]; then
    read -r BEHIND AHEAD < <(git rev-list --left-right --count "$UP...HEAD")
    [ "$BEHIND" != "0" ] && echo "[relay] Local branch is $BEHIND commit(s) behind $UP: run scripts/pickup.sh <lane> to pull first."
    [ "$AHEAD" != "0" ] && echo "[relay] $AHEAD local commit(s) not pushed yet."
  fi
fi
DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"
[ "$DIRTY" != "0" ] && echo "[relay] $DIRTY uncommitted change(s) on disk, possibly from a session that hit its limit. Inspect before overwriting."
"$ROOT/scripts/pickup.sh" --no-pull 2>/dev/null | sed 's/^/[relay] /'
exit 0
