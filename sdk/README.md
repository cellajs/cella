# sdk

Auto-generated TypeScript SDK for the backend API.

[@hey-api/openapi-ts](https://heyapi.dev) generates a typed SDK from `backend/openapi.cache.json`: API functions, Zod v4 runtime schemas, and a fetch-based client (`@hey-api/client-fetch`) that throws on error.

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
│   ├── openapi.json               The backend's spec, copied as written
│   ├── client/                    HTTP client utilities
│   └── core/                      Internal helpers
└── src/
    ├── generate-sdk.ts            Generation script (supports --watch mode)
    ├── docs-types.ts              Types for the docs JSON, imported by the frontend as `sdk/docs-types`
    ├── .spec-hash                 Cached spec hash (skip redundant runs)
    ├── openapi-parser/            Derives the docs JSON from the spec, for Vite to serve
    └── plugins/
        └── tsdoc/                 Adds TSDoc comments to generated functions
```

## Generation lifecycle

1. The backend writes `backend/openapi.cache.json`
2. `generate-sdk.ts` runs `@hey-api/openapi-ts` with `openapi-ts.config.ts` into a temp folder
3. Only files that differ from `sdk/gen/` are copied, which avoids needless HMR triggers
4. Vite serves `openapi.json`, `types.gen.ts` and `zod.gen.ts` from `sdk/gen` under `/static`, plus `docs.gen/`, which [sdk-static.ts](../frontend/vite/sdk-static.ts) derives from the spec; a deploy first writes its environment's spec over `openapi.json`

## Exports

| Import path  | Description                                   |
| ------------ | --------------------------------------------- |
| `sdk`        | All generated SDK functions                   |
| `sdk/client` | HTTP client, `createClient`, config utilities |
| `sdk/docs-types` | Types for the docs JSON served at `/static/docs.gen/` |
| `sdk/*`      | Wildcard, e.g. `sdk/types.gen`, `sdk/zod.gen` |

## Auth and validation

The functions carry no auth settings, so the client's `auth` option has no effect. The browser signs in with its session cookie. A server caller sends `Authorization: Bearer <key or token>` itself, as `headers` on a call or from a request interceptor on its client. Which auth each route accepts, and the scope a narrowed key or token needs, is listed under `security` per operation in the spec.

Responses are checked against the spec with the zod schemas. Requests are not: the server validates them, so an older client never refuses a request a newer server accepts. A caller that wants to check a body first can use the `z*` schemas in `sdk/zod.gen`.

## Scripts

```sh
pnpm generate:sdk   # Generate SDK from OpenAPI spec
pnpm dev            # Watch openapi.cache.json and regenerate on change
pnpm watch          # Alias for dev
```

## Development

The frontend dev server watches SDK output via `frontend/vite/sdk-watch.ts`.
