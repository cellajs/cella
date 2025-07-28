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
├── fixtures/
│ ├── headers.ts # Reusable request headers (e.g. defaultHeaders)
│ └── sign-up.ts # Fixture data for sign-up tests
│
├── helpers/
│ ├── create-user.ts # Programmatically insert user into DB
│ └── get-user.ts # Utility to query user from DB
│
├── utils/
│ ├── setup.ts # Shared setup utilities (e.g. mock fetch, DB migration, config toggles)
│ └── past-iso-date.ts # Utility to generate a past ISO date
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