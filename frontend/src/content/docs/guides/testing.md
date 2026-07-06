---
title: Testing
description: The test modes available in Cella and how to use them.
order: 1
keywords: testing, vitest, unit, integration
---

<!-- Sync test marker: 2026-01-28-test-1 -->

This document describes the test modes available in Cella and how to use them.

## Test Modes

Cella supports two test modes to balance speed vs. coverage:

| Mode | Database | Docker | Integration Tests | CLI Tests | Use Case |
|------|----------|--------|-------------------|-----------|----------|
| `core` | PostgreSQL | ✅ | ❌ | ❌ | Faster explicit narrow run |
| `full` | PostgreSQL | ✅ | ✅ | ✅ | Default complete validation |

These align with development modes:

| Dev Command | Test Command | Description |
|-------------|--------------|-------------|
| `pnpm dev` | `pnpm test:core` | PostgreSQL + CDC Worker |
| `pnpm dev` | `pnpm test` / `pnpm test:full` | PostgreSQL + CDC Worker (incl. CDC integration tests) |

### Core Mode (`pnpm test:core`)

- **Database**: PostgreSQL in Docker container (port 5434)
- **Requirements**: Docker running
- **Coverage**: Root workspace backend and frontend tests, excludes CDC integration tests and frontend Storybook browser tests

Best for:
- Standard development workflow
- Pre-commit validation
- Faster explicit validation when you do not need CDC/CLI coverage

```bash
pnpm test:core
```

### Full Mode (`pnpm test` or `pnpm test:full`)
- **Database**: PostgreSQL in Docker container
- **Requirements**: Docker running
- **Coverage**: Root workspace tests including CDC integration tests and CLI workspace, plus `.coverage/coverage-summary.json`; frontend Storybook browser tests are not part of the root run

Best for:
- Default validation path
- Complete CI pipeline
- Testing CDC Worker → WebSocket → ActivityBus flow end-to-end

```bash
pnpm test
```



## Writing Tests

### File Naming

- Unit tests: `*.test.ts` adjacent to source files
- Integration tests: `tests/integration/*.test.ts`

### Backend Tests

```typescript
import { describe, expect, it } from 'vitest';
import { someFunction } from '#/modules/example';

describe('someFunction', () => {
  it('should do something', () => {
    expect(someFunction()).toBe(expected);
  });
});
```

### Integration Tests (Full Mode Only)

Integration tests require real PostgreSQL and potentially CDC services:

```typescript
// tests/integration/example.test.ts
import { beforeAll, describe, it } from 'vitest';
import { db } from '#/db/db';

describe('Integration: Example', () => {
  beforeAll(async () => {
    // Setup requiring real PostgreSQL
  });

  it('should work with real database', async () => {
    // Test that requires PostgreSQL features
  });
});
```
