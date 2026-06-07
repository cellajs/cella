# sdk

Auto-generated TypeScript SDK for the backend API.

Uses [@hey-api/openapi-ts](https://heyapi.dev) to generate a fully typed SDK from the backend's OpenAPI specification (`backend/openapi.cache.json`). The generated output includes type-safe API functions, Zod v4 runtime validation schemas, and a fetch-based HTTP client (`@hey-api/client-fetch`) with automatic error throwing. Nothing in `gen/` should be edited manually — run `pnpm generate:sdk` to regenerate.

## File structure

```
sdk
├── openapi-ts.config.ts          Hey API generation config
├── gen/                           Generated output (do not edit)
│   ├── index.ts                   Re-exports all SDK functions
│   ├── sdk.gen.ts                 Type-safe API functions
│   ├── types.gen.ts               All generated TypeScript types
│   ├── zod.gen.ts                 Zod validation schemas
│   ├── client.gen.ts              Client configuration
│   ├── client/                    HTTP client utilities
│   └── core/                      Internal helpers
└── src/
    ├── generate-sdk.ts            Generation script (supports --watch mode)
    ├── console.ts                 Logging helpers
    ├── .spec-hash                 Cached spec hash (skip redundant runs)
    └── plugins/
        ├── openapi-parser/        Parses spec, generates docs to sdk/gen/docs.gen/
        └── tsdoc/                 Adds TSDoc comments to generated functions
```

## Generation lifecycle

1. The backend produces `backend/openapi.cache.json` via its OpenAPI spec
2. `generate-sdk.ts` runs `@hey-api/openapi-ts` with the config in `openapi-ts.config.ts`
3. Output is generated to a temp folder first, then diffed against `sdk/gen/`
4. Only files with actual changes are copied over — this prevents unnecessary HMR triggers
5. A lock file prevents concurrent generation runs
6. The spec hash is cached in `src/.spec-hash` so the watcher skips redundant runs on restart
7. The `openapi.json` source spec is also output to `frontend/public/static/`

## Exports

| Import path | Description |
|-------------|-------------|
| `sdk` | All generated SDK functions |
| `sdk/client` | HTTP client, `createClient`, config utilities |
| `sdk/*` | Wildcard — e.g. `sdk/types.gen`, `sdk/zod.gen` |

## Scripts

```sh
pnpm generate:sdk   # Generate SDK from OpenAPI spec
pnpm dev            # Watch openapi.cache.json and regenerate on change
pnpm watch          # Alias for dev
```

## Development

During development, run `pnpm dev` to start in watch mode. It monitors `backend/openapi.cache.json` and automatically regenerates the SDK when the spec changes (calling `generate-sdk.ts --watch` directly instead of spawning a subprocess).

The frontend dev server watches for SDK output changes via `frontend/vite/sdk-watch.ts`.
