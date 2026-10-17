#!/usr/bin/env bash
# Pick up a lane where the last session left off.
#   scripts/pickup.sh              -> pull, then show a one-line summary of every lane
#   scripts/pickup.sh <lane>       -> pull, then show that lane's baton, open tasks, recent commits
#   scripts/pickup.sh --no-pull    -> summary without touching the network (used by the session hook)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && git rev-parse --show-toplevel)" || exit 1
cd "$ROOT"

PULL=1; LANE=""
for a in "$@"; do
  case "$a" in
    --no-pull) PULL=0 ;;
    *) LANE="$a" ;;
  esac
done

lane_paths() {
  case "$1" in
    core)      echo "src/app/api src/db docker-compose.yml" ;;
    engine)    echo "src/engine src/ai" ;;
    clinician) echo "src/app/(clinician)" ;;
    patient)   echo "src/app/(patient)" ;;
    pitch)     echo "docs pitch" ;;
    lab)       echo "src/lab src/app/(clinician)/lab" ;;
    *)         echo "" ;;
  esac
}

# section <file> <heading>: print the body of a "## heading" section, minus HTML comments and blanks
section() {
  awk -v h="## $2" '
    $0==h {on=1; next}
    on && /^## / {exit}
    on && /^<!--/ {skip=1}
    on && !skip && NF {print}
    skip && /-->/ {skip=0}
  ' "$1"
}

if [ "$PULL" = 1 ]; then
  if git remote | grep -q .; then
    if ! git pull --rebase --autostash --quiet; then
      echo "!! git pull --rebase failed. Resolve conflicts (git status), then rerun." >&2
      exit 1
    fi
  else
    echo "(no git remote configured, skipping pull)"
  fi
fi

if [ -z "$LANE" ]; then
  echo "== Lanes =="
  for f in relay/*.md; do
    [ "$(basename "$f")" = "README.md" ] && continue
    l="$(basename "$f" .md)"
    status="$(section "$f" Status | head -1)"
    flight="$(section "$f" "In flight" | head -1)"
    when="$(git log -1 --format='%cr by %an' -- "$f" 2>/dev/null)"
    printf '%-10s %s\n' "$l" "${status:-?}"
    [ -n "$flight" ] && [ "$flight" != "(none)" ] && printf '%-10s IN FLIGHT: %s\n' "" "$flight"
    [ -n "$when" ] && printf '%-10s baton updated %s\n' "" "$when"
  done
  echo
  echo "Run: scripts/pickup.sh <lane>   (or /pickup <lane> in Claude Code)"
  exit 0
fi

F="relay/$LANE.md"
if [ ! -f "$F" ]; then
  echo "No such lane: $LANE. Lanes: $(ls relay | grep -v README | sed 's/\.md$//' | tr '\n' ' ')" >&2
  exit 1
fi

echo "================ relay/$LANE.md ================"
cat "$F"
echo
echo "================ open tasks for $LANE ================"
grep -E "^\| T-[0-9]+ \| $LANE \|" TASKS.md | grep -v "| done |" || echo "(none)"
echo
echo "================ recent commits touching $LANE ================"
# shellcheck disable=SC2046
git log --format='%h %cr %an: %s' -10 -- $(lane_paths "$LANE") "$F" 2>/dev/null || true
echo
echo "================ working tree ================"
git status --short | head -30
[ -z "$(git status --short)" ] && echo "(clean)"
