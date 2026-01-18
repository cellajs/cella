#!/bin/bash
# Integration test for cli/sync functionality
# Runs sync analysis on the current repository to verify end-to-end behavior
#
# Usage: ./scripts/test-sync.sh
# Or:    pnpm test:integration

set -e

CELLA_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$CELLA_DIR"

echo "🧪 Running sync CLI integration test..."
echo "   Directory: $CELLA_DIR"
echo ""

# Test 1: Validate config
echo "📋 Test 1: Validating cella.config.ts..."
pnpm --filter @cellajs/sync sync --sync-service validate --yes
echo "✅ Config validation passed"
echo ""

# Test 2: Run analyze (read-only)
echo "📊 Test 2: Running sync analysis..."
pnpm --filter @cellajs/sync sync --sync-service analyze --yes
echo "✅ Analysis completed"
echo ""

# Test 3: Test CLI help
echo "📖 Test 3: Verifying CLI help..."
pnpm --filter @cellajs/sync sync --help > /dev/null
echo "✅ CLI help works"
echo ""

echo "✅ All integration tests passed!"