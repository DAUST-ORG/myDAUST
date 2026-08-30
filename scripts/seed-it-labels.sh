#!/usr/bin/env bash
# Idempotent: creates the three IT labels if they don't already exist.
# Re-running is a no-op.
#
# Usage (operator):  gh auth login && ./scripts/seed-it-labels.sh
# The script targets the repo this checkout belongs to.

set -euo pipefail

REPO="${SEED_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

declare -a LABELS=(
  "it-backlog|1d76db|IT backlog items"
  "it-bug|d73a4a|IT-tracked bug reports"
  "it-task|fbca04|IT-tracked operational tasks"
)

for entry in "${LABELS[@]}"; do
  IFS='|' read -r name color description <<<"$entry"
  if gh label view "$name" --repo "$REPO" >/dev/null 2>&1; then
    echo "exists: $name"
  else
    gh label create "$name" \
      --repo "$REPO" \
      --color "$color" \
      --description "$description"
    echo "created: $name"
  fi
done
