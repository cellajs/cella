# sdk

Auto-generated TypeScript SDK for the backend API.

[@hey-api/openapi-ts](https://heyapi.dev) generates a typed SDK from `backend/openapi.cache.json`: API functions, Zod v4 runtime schemas, and a fetch-based client (`@hey-api/client-fetch`) that throws on error. Never edit `gen/` by hand; run `pnpm generate:sdk`.

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

1. The backend writes `backend/openapi.cache.json`
2. `generate-sdk.ts` runs `@hey-api/openapi-ts` with `openapi-ts.config.ts`
3. Output lands in a temp folder and is diffed against `sdk/gen/`
4. Only changed files are copied, which avoids needless HMR triggers
5. A lock file prevents concurrent runs
6. `src/.spec-hash` caches the spec hash so the watcher skips redundant runs on restart
7. The `openapi.json` source spec is also written to `frontend/public/static/`

## Exports

| Import path  | Description                                   |
| ------------ | --------------------------------------------- |
| `sdk`        | All generated SDK functions                   |
| `sdk/client` | HTTP client, `createClient`, config utilities |
| `sdk/*`      | Wildcard, e.g. `sdk/types.gen`, `sdk/zod.gen` |

## Scripts

```sh
pnpm generate:sdk   # Generate SDK from OpenAPI spec
pnpm dev            # Watch openapi.cache.json and regenerate on change
pnpm watch          # Alias for dev
```

## Development

`pnpm dev` watches `backend/openapi.cache.json` and regenerates on change (it calls `generate-sdk.ts --watch` in-process). The frontend dev server watches SDK output via `frontend/vite/sdk-watch.ts`.
