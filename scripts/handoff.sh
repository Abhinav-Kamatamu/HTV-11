#!/usr/bin/env bash
# Commit everything on disk for a lane, log the handoff in relay/<lane>.md, and push.
# Works WITHOUT Claude: run it yourself when your session hits its limit.
#   scripts/handoff.sh <lane> "one line summary"
#   scripts/handoff.sh engine "limit hit, trends.ts half done, tests failing on projection"
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && git rev-parse --show-toplevel)" || exit 1
cd "$ROOT"

LANE="${1:-}"; SUMMARY="${2:-handoff}"
if [ -z "$LANE" ] || [ ! -f "relay/$LANE.md" ]; then
  echo "usage: scripts/handoff.sh <lane> \"summary\"" >&2
  echo "lanes: $(ls relay | grep -v README | sed 's/\.md$//' | tr '\n' ' ')" >&2
  exit 1
fi

WHO="$(git config user.name || echo unknown)"
WHEN="$(date '+%Y-%m-%d %H:%M')"

git add -A

# Guard: never commit env files with secrets.
BAD="$(git diff --cached --name-only | grep -E '(^|/)\.env($|\.local$|\.[a-z]+\.local$)' || true)"
if [ -n "$BAD" ]; then
  echo "!! Refusing to commit secret files, unstaging: $BAD" >&2
  echo "$BAD" | xargs git restore --staged --
fi

FILES="$(git diff --cached --name-only | grep -v "^relay/$LANE.md$" || true)"
COUNT="$(printf '%s' "$FILES" | grep -c . || true)"
ENTRY="- $WHEN · $WHO · $SUMMARY · $COUNT file(s) changed since last commit"
[ -n "$FILES" ] && ENTRY="$ENTRY"$'\n'"$(printf '%s\n' "$FILES" | head -15 | sed 's/^/    - /')"

# Insert the entry directly under "## Log" (after its HTML comment), newest on top.
TMP="$(mktemp)"
ENTRY="$ENTRY" awk '
  done_ins==0 && seen && !/^<!--.*-->$/ { print ENVIRON["ENTRY"]; done_ins=1 }
  { print }
  /^## Log/ { seen=1 }
  END { if (!done_ins) print ENVIRON["ENTRY"] }
' "relay/$LANE.md" > "$TMP" && mv "$TMP" "relay/$LANE.md"
git add "relay/$LANE.md"

git commit -q -m "relay($LANE): handoff · $SUMMARY" || echo "(nothing new to commit)"

if ! git remote | grep -q .; then
  echo "No remote configured. Committed locally only." >&2
  exit 0
fi

if ! git pull --rebase --autostash --quiet; then
  echo "!! Rebase conflict. Your work IS committed locally." >&2
  echo "   Fix conflicts (git status), then: git rebase --continue && git push" >&2
  echo "   Or give up the rebase and push to a side branch:" >&2
  echo "   git rebase --abort && git push origin HEAD:handoff/$LANE-$(date +%H%M)" >&2
  exit 1
fi

if git push --quiet; then
  echo "Handed off lane '$LANE'. Next person: scripts/pickup.sh $LANE  (or /pickup $LANE)"
else
  echo "!! Push failed. Work is committed locally. Try: git push" >&2
  exit 1
fi
