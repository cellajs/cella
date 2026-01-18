#!/bin/bash
# Creates the sync-test-fixture repo for integration testing
# Run this once to set up the fixture repo on GitHub
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated
#   - Write access to cellajs organization
#
# Usage: ./create-fixture-repo.sh

set -e

REPO_NAME="sync-test-fixture"
ORG="cellajs"
TEMP_DIR=$(mktemp -d)

echo "🔧 Creating $ORG/$REPO_NAME fixture repo..."
echo "   Temp directory: $TEMP_DIR"
echo ""

cd "$TEMP_DIR"

# Initialize repo
git init
git config user.email "test@cellajs.com"
git config user.name "Cella Test"

# Create directory structure
mkdir -p backend/src frontend/src docs

# v1.0.0 - Initial state
echo '// Backend entry
export const backend = true;' > backend/src/index.ts

echo '// Frontend entry
export const frontend = true;' > frontend/src/index.ts

echo '# Setup Guide
This file is ignored during sync.' > docs/setup.md

echo '// Custom file - fork can customize this
export const custom = "original";' > custom-file.ts

echo '// This file will be deprecated in v1.3.0
export const deprecated = true;' > deprecated.ts

echo '{"name": "sync-test-fixture", "version": "1.0.0"}' > package.json

echo '# sync-test-fixture

Test fixture for Cella sync CLI integration tests.
' > README.md

# Create cella.config.ts
cat > cella.config.ts << 'EOF'
// Minimal config for testing sync behavior
export default {
  fork: {
    branch: 'main',
    syncBranch: 'cella-sync',
  },
  upstream: {
    branch: 'main',
  },
  overrides: {
    customized: ['custom-file.ts', 'cella.config.ts'],
    ignored: ['docs/*'],
  },
};
EOF

git add -A
git commit -m "Initial commit"
git tag v1.0.0
echo "✅ Created v1.0.0 - Initial state"

# v1.1.0 - Add new feature
echo '// New feature added in v1.1.0
export const feature = true;
export const addedIn = "v1.1.0";' > new-feature.ts

git add -A
git commit -m "feat: add new feature"
git tag v1.1.0
echo "✅ Created v1.1.0 - Added new-feature.ts"

# v1.2.0 - Update backend
echo '// Backend entry - updated in v1.2.0
export const backend = true;
export const updated = true;
export const version = "1.2.0";' > backend/src/index.ts

git add -A
git commit -m "chore: update backend"
git tag v1.2.0
echo "✅ Created v1.2.0 - Updated backend/src/index.ts"

# v1.3.0 - Remove deprecated file
rm deprecated.ts
git add -A
git commit -m "chore: remove deprecated file"
git tag v1.3.0
echo "✅ Created v1.3.0 - Removed deprecated.ts"

# v1.4.0 - Modify customized file (tests customized override)
echo '// Custom file - updated in upstream v1.4.0
// Fork should keep their version if marked as customized
export const custom = "upstream-v1.4.0";' > custom-file.ts

git add -A
git commit -m "chore: update custom file"
git tag v1.4.0
echo "✅ Created v1.4.0 - Modified custom-file.ts"

# v1.5.0 - Modify ignored file (tests ignored override)
echo '# Setup Guide - Updated
This file should be ignored during sync.
Updated in v1.5.0.' > docs/setup.md

git add -A
git commit -m "docs: update setup guide"
git tag v1.5.0
echo "✅ Created v1.5.0 - Modified docs/setup.md (ignored)"

echo ""
echo "📦 Creating GitHub repository..."

# Create the repo on GitHub
gh repo create "$ORG/$REPO_NAME" \
  --public \
  --description "Test fixture for Cella sync CLI integration tests" \
  --source=. \
  --push

# Push all tags
git push --tags

echo ""
echo "✅ Fixture repo created successfully!"
echo "   https://github.com/$ORG/$REPO_NAME"
echo ""
echo "You can now run integration tests:"
echo "   cd cli/sync && pnpm test:integration"

# Cleanup
cd -
rm -rf "$TEMP_DIR"
