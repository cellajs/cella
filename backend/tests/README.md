# Tests

All backend tests. See [Testing](../../cella/TESTING.md) for modes, placement rules, and the test database.

## Structure

```bash
tests/
├── fixtures.ts      # Test constants (dumb data, headers, base configs)
├── helpers.ts       # Test logic helpers (inserting/fetching domain models)
├── setup.ts         # Test environment control (DB, config, app mock, lifecycle)
├── global-setup.ts  # Prepares the shared test database once per run
├── test-client.ts   # HTTP client against the app under test
├── integration/     # Tests that need more than the test database (excluded in core mode)
└── <area>/          # Route-level tests grouped by area (sign-in, security, invitations, ...)
```

## Running tests

```bash
pnpm test
```

## Notes

- Tests run serially against the shared Docker test database; never assume it is empty.
- Configuration (e.g. enabled auth strategies) can be toggled per test via `setup.ts`.
