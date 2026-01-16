#!/bin/bash
# Test script for cli/sync functionality
# Creates an isolated test fork and runs sync against it

set -e

# Configuration
TEST_DIR="${TMPDIR:-/tmp}/cella-sync-test-$$"
CELLA_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
TEST_BRANCH="test-fork-branch"
SYNC_BRANCH="test-sync-branch"

echo "🧪 Setting up test environment..."
echo "   Test directory: $TEST_DIR"
echo "   Cella directory: $CELLA_DIR"

# Cleanup function
cleanup() {
  echo "🧹 Cleaning up test directory..."
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Create test directory
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Initialize a git repo that simulates a fork
git init
git config user.email "test@example.com"
git config user.name "Test User"

# Add cella as a remote (local path for testing)
git remote add cella-remote "$CELLA_DIR"

# Fetch the development branch from local cella
git fetch cella-remote development

# Create and checkout test branch from cella's development
git checkout -b "$TEST_BRANCH" cella-remote/development

# Simulate some fork customizations
echo "# Test Fork" > README.md
git add README.md
git commit -m "chore: customize README for fork"

# Create a minimal cella.config.ts for the test fork
cat > cella.config.ts << 'EOF'
import { DeepPartial, SyncConfig } from "./cli/sync/src/config/types";

export const cellaConfig: DeepPartial<SyncConfig> = {
  fork: {
    branch: "test-fork-branch",
    syncBranch: "test-sync-branch",
    localPath: process.cwd(),
  },
  upstream: {
    branch: "development",
    localPath: process.env.CELLA_UPSTREAM_PATH || "",
  },
  overrides: {
    customized: ["README.md"],
  }
}
EOF
git add cella.config.ts
git commit -m "chore: add test cella config"

echo "✔ Test fork created successfully"
echo ""
echo "Running sync analysis..."

# Run the sync in analyze-only mode
cd "$CELLA_DIR"
CELLA_TEST_FORK_PATH="$TEST_DIR" tsx ./cli/sync/src/index.ts \
  --sync-service analyze \
  --fork-branch "$TEST_BRANCH" \
  --fork-sync-branch "$SYNC_BRANCH" \
  --upstream-location local \
  --upstream-branch development

echo ""
echo "✔ Sync analysis completed successfully!"