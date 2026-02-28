# Testing Guide

<!-- Sync test marker: 2026-01-28-test-1 -->

This document describes the test modes available in Cella and how to use them.

## Test Modes

Cella supports three test modes to balance speed vs. coverage:

| Mode | Database | Docker | Integration Tests | CLI Tests | Use Case |
|------|----------|--------|-------------------|-----------|----------|
| `basic` | None | ❌ | ❌ | ❌ | Fast unit tests only |
| `core` | PostgreSQL | ✅ | ❌ | ❌ | Standard CI/pre-commit |
| `full` | PostgreSQL | ✅ | ✅ | ✅ | Complete validation |

These align with development modes:

| Dev Command | Test Command | DEV_MODE | Description |
|-------------|--------------|----------|-------------|
| `pnpm quick` | `pnpm test:basic` | basic | PGlite, no Docker |
| `pnpm dev:core` | `pnpm test:core` | core | PostgreSQL, no CDC |
| `pnpm dev` | `pnpm test:full` | full | PostgreSQL + CDC Worker |

### Basic Mode (`pnpm test:basic`)

- **Database**: None (database tests skipped)
- **Requirements**: None (no Docker needed)
- **Coverage**: Unit tests only (e.g., permission manager, utilities)

Best for:
- Quick feedback during active development
- Running tests without Docker installed
- CI checks on resource-constrained environments
- Testing pure logic that doesn't need database

```bash
pnpm test:basic
```

### Core Mode (`pnpm test:core` or `pnpm test`)

- **Database**: PostgreSQL in Docker container (port 5434)
- **Requirements**: Docker running
- **Coverage**: All backend and frontend tests, excludes CDC integration tests

Best for:
- Standard development workflow
- Pre-commit validation
- CI pipeline default

```bash
pnpm test:core
# or simply
pnpm test
```

### Full Mode (`pnpm test:full`)
- **Database**: PostgreSQL in Docker container
- **Requirements**: Docker running, CDC Worker available
- **Coverage**: All tests including CDC integration tests and CLI workspace

Best for:
- Pre-release validation
- Complete CI pipeline
- Testing CDC Worker → WebSocket → ActivityBus flow end-to-end

```bash
pnpm test:full
```

## Infrastructure

Vitest workspace (`vitest.config.ts`) runs backend, shared, and frontend tests from a single `pnpm vitest` command (or `--project=backend` for isolation).

`backend/tests/global-setup.ts` runs Drizzle migrations against the dedicated test database (Docker Compose `test` profile, port 5434) before any tests. Exits gracefully with a helpful message if Postgres is unavailable.

### Notable test suites

* `backend/tests/integration/rls-security.test.ts`: Full RLS regression tests using two DB connections (`adminDb` as superuser, `runtimeDb` as `runtime_role`) verifying data isolation across tenants, orgs, and public access. Requires `pnpm test:full`.
* `backend/src/permissions/permission-manager/check.perf.test.ts`: Permission manager performance tests.

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