# sync-test-fixture

Test fixture repository for Cella sync CLI integration tests.

## Purpose

This repo provides a controlled git history for testing merge scenarios in the sync CLI. It's cloned and cached locally during test runs.

## Structure

```
sync-test-fixture/
├── cella.config.ts          # Config with pinned/ignored entries
├── package.json
├── README.md
├── backend/
│   └── src/
│       └── index.ts         # Sample backend file
├── frontend/
│   └── src/
│       └── index.ts         # Sample frontend file
├── docs/
│   └── setup.md             # Ignored file (in cella.config.ts)
└── custom-file.ts           # Pinned file (in cella.config.ts)
```

## Tags (Versions)

| Tag | Description | Changes from previous |
|-----|-------------|----------------------|
| `v1.0.0` | Initial state | Base files |
| `v1.1.0` | New feature | Adds `new-feature.ts` |
| `v1.2.0` | Backend update | Modifies `backend/src/index.ts` |
| `v1.3.0` | Cleanup | Deletes `deprecated.ts` |
| `v1.4.0` | Custom change | Modifies `custom-file.ts` |

## cella.config.ts

```typescript
import { defineConfig } from './cli/cella/src/config/types';

export default defineConfig({
  settings: {
    upstreamUrl: 'git@github.com:cellajs/sync-test-fixture.git',
    upstreamBranch: 'main',
    forkBranch: 'main',
  },
  overrides: {
    pinned: ['custom-file.ts', 'cella.config.ts'],
    ignored: ['docs/*'],
  },
});
```

## Creating the Fixture Repo

```bash
# Initialize
mkdir sync-test-fixture && cd sync-test-fixture
git init
git config user.email "test@cellajs.com"
git config user.name "Cella Test"

# v1.0.0 - Initial state
mkdir -p backend/src frontend/src docs
echo '// Backend entry\nexport const backend = true;' > backend/src/index.ts
echo '// Frontend entry\nexport const frontend = true;' > frontend/src/index.ts
echo '# Setup Guide\nIgnored file.' > docs/setup.md
echo '// Custom file\nexport const custom = "original";' > custom-file.ts
echo '// Will be deprecated' > deprecated.ts
echo '{"name": "sync-test-fixture"}' > package.json
echo '# sync-test-fixture' > README.md

# Create cella.config.ts (simplified for testing)
cat > cella.config.ts << 'EOF'
export default {
  settings: {
    upstreamUrl: 'git@github.com:cellajs/sync-test-fixture.git',
    upstreamBranch: 'main',
    forkBranch: 'main',
  },
  overrides: {
    pinned: ['custom-file.ts', 'cella.config.ts'],
    ignored: ['docs/*'],
  },
};
EOF

git add -A && git commit -m "Initial commit"
git tag v1.0.0

# v1.1.0 - Add new feature
echo '// New feature\nexport const feature = true;' > new-feature.ts
git add -A && git commit -m "feat: add new feature"
git tag v1.1.0

# v1.2.0 - Update backend
echo '// Backend v2\nexport const backend = true;\nexport const updated = true;' > backend/src/index.ts
git add -A && git commit -m "chore: update backend"
git tag v1.2.0

# v1.3.0 - Remove deprecated
rm deprecated.ts
git add -A && git commit -m "chore: remove deprecated file"
git tag v1.3.0

# v1.4.0 - Modify pinned file
echo '// Custom file v2\nexport const custom = "updated";' > custom-file.ts
git add -A && git commit -m "chore: update custom file"
git tag v1.4.0

# Push to GitHub
gh repo create cellajs/sync-test-fixture --public --source=. --push
git push --tags
```

## Usage in Tests

```typescript
import { createTestEnv } from './helpers/test-repos';

const env = await createTestEnv({
  upstreamRef: 'v1.2.0',    // Upstream at this tag
  forkStartRef: 'v1.0.0',   // Fork starts here
});

// Make fork changes, run sync, verify results
// ...

env.cleanup();
```
