# infra tests: where a test file lives

## Co-located `*.test.ts` (next to the module): the default

A test that imports **one** module and exercises its exported behaviour lives beside that module (`lib/**`, `tasks/**`, `boot/src/**`, `cli/**`, `compose/**`).

Modules under `resources/` construct live Pulumi resources at import time, so their co-located test primes the mock runtime and dynamic-imports the module. It is still a single-module test and lives beside the source (`resources/storage.test.ts`, `resources/network.test.ts`, `resources/cloud-init.test.ts`, `resources/stores/*.test.ts`).

## `tests/`: everything cross-cutting

- **`tests/unit/`**: tests without a single owning module. Source-shape checks that read a file as text (`loadbalancer`, `compute`, `resource-contracts`, `no-unexpected-public`, `caddyfile`), or tests spanning several modules or packages (`runtime-secrets` reads each service's `env.ts`).
- **`tests/integration/`**: needs a live host or network; excluded from `pnpm test`, opt in with `pnpm test:integration` (`INTEGRATION=1`).
- **`tests/helpers/`**: shared fixtures and the Pulumi mock harness. Not tests.
