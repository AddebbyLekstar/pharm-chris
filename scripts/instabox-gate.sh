#!/usr/bin/env bash
# Drives the verification gate on one Instabox PC sandbox, end to end, and pulls
# the evidence. Bash/git-bash on Windows; instabox is invoked through npx.
#
#   bash scripts/instabox-gate.sh hermes
#
# Why this exists: the earlier flow broke three ways —
#   1. `exec --background` silently drops a multi-line `--` command (empty cmd, exit 0);
#   2. `push` nests the repo one level deeper when the remote dir already exists;
#   3. `pull` races the job, returning yesterday's files as if they were today's.
# So: push into a fresh remote dir, resolve the real repo root, run a script file,
# wait on the job id, then pull.
set -u

BOX="${1:?usage: instabox-gate.sh <box>}"
REPO_LOCAL="C:/Users/hp/pharm-chris"
REMOTE="/data/home/pc-check"

retry() {
  local i
  for i in 1 2 3 4 5 6; do
    "$@" && return 0
    echo "  retry $i failed: $*" >&2
    sleep 8
  done
  return 1
}

echo "=== $BOX ==="
retry npx -y instabox resume "$BOX" >/dev/null || { echo "resume failed"; exit 1; }

# Fresh remote dir every run: removes the nesting and the stale-evidence problem.
retry npx -y instabox exec "$BOX" -- 'rm -rf /data/home/pc-check /data/home/check-out' >/dev/null || { echo "clean failed"; exit 1; }
retry npx -y instabox push "$BOX" "$REPO_LOCAL" "$REMOTE" >/dev/null || { echo "push failed"; exit 1; }

ROOT=$(npx -y instabox exec "$BOX" -- 'for d in /data/home/pc-check /data/home/pc-check/pharm-chris; do if [ -f "$d/scripts/box-run.sh" ]; then echo ROOT=$d; fi; done; true' | grep -o 'ROOT=/.*' | tail -1 | cut -d= -f2)

echo "ROOT=$ROOT"
[ -z "$ROOT" ] && { echo "box-run.sh not found on box (push may have failed)"; exit 1; }

START=$(npx -y instabox exec --background "$BOX" --cwd "$ROOT" -- 'bash scripts/box-run.sh' 2>&1)
echo "$START" | tail -2
JOB=$(echo "$START" | grep -oE 'job [0-9a-f]+' | awk '{print $2}')
[ -z "$JOB" ] && { echo "no job id returned"; exit 1; }

npx -y instabox jobs wait "$BOX" "$JOB"; echo "WAIT_EXIT=$?"
npx -y instabox jobs logs "$BOX" "$JOB" | tail -30

npx -y instabox pull "$BOX" /data/home/check-out "C:/Users/hp/pharm-chris/instabox-check/$BOX" || exit 1
echo "PULLED=$BOX"
