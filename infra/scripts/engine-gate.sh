#!/usr/bin/env bash
# Engine-purity gate (.todos/INFRA.md): the deploy engine — resources/,
# compose/, lib/, boot/src/ — must not contain app knowledge. Refined per
# P-F1 so it can actually go green: case-sensitive \bMODE\b (lowercase "mode"
# is a legitimate engine concept), the quoted literal '/health' (import paths
# and prose don't count), and service(Url|Host) called with a literal service
# name. Tests and build artifacts are excluded. (The former runMigrate genId
# pin was retired in the 2026-08 planned generation roll — no allowlist left.)
set -uo pipefail
cd "$(dirname "$0")/.."

PATTERNS=(
  '[cC]ella'
  '\bMODE\b'
  "'/health'"
  'service(Url|Host)\(.?(frontend|backend|cdc|yjs|mcp)'
  '\bmigrate\b'
)
violations=0
for pattern in "${PATTERNS[@]}"; do
  hits=$(grep -rEn "$pattern" resources compose lib boot/src \
    --include='*.ts' --exclude='*.test.ts' || true)
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
