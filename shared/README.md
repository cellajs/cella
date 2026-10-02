# shared

Shared configuration, types, permissions, and utilities used by all packages.

`config/config.default.ts` holds the full base config. Mode files (`config/config.development.ts`, etc.) provide partial overrides merged via `mergeDeep` into the exported `appConfig`. To add a mode: add it to `ConfigMode` in `types.ts`, create the config file in `shared/config/`, and register it in `app-config.ts`. `config-validation.ts` checks at compile time that config arrays match the hierarchy.

## Dev ports

`devPorts` in `config/config.default.ts` holds the local listen ports, and the development URL family (`frontendUrl`, `backendUrl`, ...) carries the frontend port. An app moves both by a ten of its own, so two apps run side by side.

A second checkout of the same app gets a further offset. `src/config-builder/app-config.ts` adds it to `devPorts` and to every `localhost` URL, in development and tunnel mode:

- The main checkout keeps the configured ports.
- A linked git worktree claims one of nine slots, 100 ports apart: 3100 and 4100-4106, then 3200 and 4200-4206, and so on. The claim is a file in `dev-port-slots/` of the shared git directory. It is kept between runs and freed when the worktree is removed. Once all nine are held, a new worktree takes the slot whose stack started longest ago.
- `DEV_PORT_OFFSET` sets the offset by hand, `0` for the configured ports. It is read from the process environment only: `backend/.env` loads after the config is built.

`appConfig.devPortOffset` reports the result, and `appConfig.frontendUrl` is where that checkout's app runs. Generated files read the same in every checkout: `backend/openapi.cache.json`, and the SDK and docs generated from it, are written with the configured URLs.

`pnpm stop` ends the Vite dev server on this checkout's port only. In a checkout with an offset it leaves the database container running, because the main checkout shares it.

## File structure

```
shared
├── index.ts                       Package entry point
├── types.ts                       Core shared types (ConfigMode, EntityType, etc.)
├── config/
│   ├── config.default.ts          Full base app config
│   ├── config.development.ts      Dev overrides
│   ├── config.production.ts       Production overrides
│   ├── config.staging.ts          Staging overrides
│   ├── config.test.ts             Test overrides
│   ├── config.tunnel.ts           Tunnel overrides
│   ├── hierarchy-config.ts        Entity hierarchy definition (builder pattern)
│   ├── permissions-config.ts      Permission policies per entity type
│   └── transloadit-config.ts      Transloadit upload templates
├── scripts/                       TSX loader registration, wait-for-backend helper
└── src/
    ├── config-builder/            Merges base + mode config → appConfig, compile-time validation
    ├── permissions/               Access policies, computeCan, shared by backend & frontend
    ├── tracing/                   OpenTelemetry setup, span names, span processor
    ├── utils/                     Display order, entity IDs, nanoid, worker lifecycle, etc.
    ├── otel.ts                    OTel convenience exports
    └── pino.ts                    Shared Pino logger config
```
