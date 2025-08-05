# Tests

This folder contains all tests for the backend.

## Structure

```bash
tests/
├── sign-up/
│ ├── basic.test.ts # Core sign-up flow (happy path, validation)
│ ├── password-disabled.test.ts # Sign-up flow when password auth is disabled
│ └── registration-disabled.test.ts # Sign-up flow when registration is disabled
│
├── fixtures.ts # Test constants (e.g. dumb data, headers, base configs)
│
├── helpers.ts # Test logic helpers (e.g. inserting/fetching domain models)
│
├── setup.ts  # Test environment control (e.g. DB, config, app mock, lifecycle utilities)
│
└── README.md
```

## Running Tests

```bash
pnpm test
```

## Notes

- All tests are integration-level and run against a local in-memory database.
- Configuration (like enabled auth strategies) can be dynamically toggled per test via utils/setup.ts.
- The fixtures/ directory holds static reusable data, while helpers/ contains logic to interact with the test environment.