#!/usr/bin/env bash
# Engine-purity gate (.todos/INFRA.md): the deploy engine — resources/,
# compose/, lib/, boot/src/ — must not contain app knowledge. Refined per
# P-F1 so it can actually go green: case-sensitive \bMODE\b (lowercase "mode"
# is a legitimate engine concept), the quoted literal '/health' (import paths
# and prose don't count), and service(Url|Host) called with a literal service
# name. Tests and build artifacts are excluded. One blessed pin is allowlisted:
# the runMigrate genId fingerprint key (P-F2 — fingerprint object keys are
# hashed into every live genId; renaming it re-rolls every generation).
set -uo pipefail
cd "$(dirname "$0")/.."

PATTERNS=(
  '[cC]ella'
  '\bMODE\b'
  "'/health'"
  'service(Url|Host)\(.?(frontend|backend|cdc|yjs|mcp)'
  '\bmigrate\b'
)
ALLOW='resources/generations\.ts:[0-9]+:.*runMigrate'

violations=0
for pattern in "${PATTERNS[@]}"; do
  hits=$(grep -rEn "$pattern" resources compose lib boot/src \
    --include='*.ts' --exclude='*.test.ts' | grep -Ev "$ALLOW" || true)
  if [ -n "$hits" ]; then
    echo "── pattern: $pattern"
    echo "$hits"
    echo
    violations=1
  fi
done

if [ "$violations" -eq 0 ]; then
  echo "engine gate: clean"
else
  echo "engine gate: violations above — engine code must not know the app (see .todos/INFRA.md)"
  exit 1
fi
