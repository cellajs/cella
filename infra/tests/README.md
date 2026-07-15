# infra tests: where a test file lives

Two homes, chosen by what the test actually exercises. Keep to this rule so the
layout stays predictable.

## Co-located `*.test.ts` (next to the module): the default

A test that imports **one** module and exercises its exported behaviour lives
beside that module. This is the common case (`lib/**`, `tasks/**`, `agent/src/**`,
`cli/**`, `compose/**`).

Modules under `resources/` construct live Pulumi resources at import time, so a
co-located test primes the mock runtime and dynamic-imports the module. It is
still a single-module behavioural test and still lives beside the source
(`resources/database.test.ts`, `resources/storage.test.ts`,
`resources/network.test.ts`).

## `tests/`: everything cross-cutting

- **`tests/unit/`**: tests that don't belong to a single module. Source-invariant
  checks that read a file as text and assert on its shape
  (`loadbalancer`, `compute`, `module-invariants`, `no-unexpected-public`,
  `caddyfile`), or that span several modules / packages
  (`runtime-secrets` reads each service's `env.ts`).
- **`tests/integration/`**: needs a live host or network; excluded from
  `pnpm test`, opt back in with `pnpm test:integration` (`INTEGRATION=1`).
- **`tests/helpers/`**: shared fixtures and the Pulumi mock harness. Not tests.

## Quick decision

> Does the test import and drive exactly one module (mock harness is fine)?
> → co-locate. Otherwise → `tests/`.
