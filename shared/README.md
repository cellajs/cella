# shared

Shared configuration, types, permissions, and utilities used by all packages.

`config/config.default.ts` holds the full base config. Mode files (`config/config.development.ts`, etc.) provide partial overrides, derived from the default where they only vary it, merged via `mergeDeep` into the exported `appConfig`. To add a mode: add it to `ConfigMode` in `src/config-builder/types.ts`, create the config file in `shared/config/`, and register it in `app-config.ts`. `app-config.ts` refuses an invalid config while it builds `appConfig`, and `config-validation.ts` checks the config against the permission policies.

## Origin and services

The app has one `origin` per mode, and every service serves under a path of it (`servicePaths`): the builder derives `frontendUrl`, `backendUrl`, `yjsUrl`, `mcpUrl` and `oauthUrl`, and `services.<slug>.publicUrl`, so no mode file and no app names a service URL. `APP_ORIGIN` in the environment replaces the origin, for a build or a container served elsewhere than the config names. `appConfig.isLocal` tells a stack on this machine (development, tunnel, test) from a deployed one (`isDeployed`: staging, production).

`services` in `config/config.default.ts` says which services the app runs and the port each listens on. The same ports are the Vite proxy targets, the deployed containers' ports and the folded workers' ports under `singleVM`; `infra/config/services.config.ts` repeats them, held equal by a test.

## Dev ports

Each app on a machine has its own number, `devAppIndex`, so apps run side by side and a browser tab switches between them by the last digit of the port:

| Port | App number N | App 0 | App 1 | App 2 |
| --- | --- | --- | --- | --- |
| Frontend | 3000 + N | 3000 | 3001 | 3002 |
| Services | 4000 + 10N, seven ports | 4000-4006 | 4010-4016 | 4020-4026 |
| Dev database | 5432 + 10N | 5432 | 5442 | 5452 |
| Test database | 5434 + 10N | 5434 | 5444 | 5454 |
| Audit database | 5470 + 10N | 5470 | 5480 | 5490 |

Storybook and Drizzle Studio follow the frontend port (`src/utils/tool-ports.ts`). The database ports follow the number too (`src/local-database.ts`): `pnpm docker` hands them to Docker Compose, and a local stack's database URLs default to them, so `backend/.env` names no port. `DB_PORT`, `DB_TEST_PORT` and `DB_A11Y_PORT` in the environment point one purpose at another server. The numbers run from 0 to 9 without 4, whose internal listener would sit on a port that `fetch` refuses. The config refuses such a port at startup.

A second checkout of the same app gets a further offset. `src/config-builder/app-config.ts` adds it to every service port and to the `localhost` origin, in development and tunnel mode:

- The main checkout keeps the configured ports.
- A linked git worktree claims one of nine slots, 100 ports apart: 3100 and 4100-4106, then 3200 and 4200-4206, and so on. The claim is a file in `dev-port-slots/` of the shared git directory. It is kept between runs and freed when the worktree is removed. Once all nine are held, a new worktree takes the slot whose stack started longest ago.
- `DEV_PORT_OFFSET` sets the offset by hand, `0` for the configured ports. It is read from the process environment only: `backend/.env` loads after the config is built. The database is shared: the offset never moves it.

`appConfig.devPortOffset` reports the result, and `appConfig.frontendUrl` is where that checkout's app runs. Generated files read the same in every checkout: `backend/openapi.cache.json`, and the SDK and docs generated from it, are written with the configured URLs.

`pnpm stop` ends the Vite dev server on this checkout's port only. In a checkout with an offset it leaves the database container running, because the main checkout shares it.

Every dev server and database container listens on `127.0.0.1` only, so no other machine on the network reaches the stack; production and staging listen on every interface. `DEV_HOST=0.0.0.0 pnpm dev` opens the Vite dev server to other devices, such as a phone, while the services it proxies stay on loopback.

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
├── scripts/                       The repo checks and the style rules (scripts/README.md)
└── src/
    ├── config-builder/            Merges base + mode config → appConfig, service paths, entity hierarchy, load-time config checks
    ├── local-database.ts          The compose databases' ports and URLs, by purpose and app number
    ├── permissions/               Access policies and the permission engine, shared by backend & frontend
    ├── tracing/                   OpenTelemetry setup, span names, span processor
    ├── utils/                     Display order, entity IDs, nanoid, worker lifecycle, etc.
    ├── otel.ts                    OpenTelemetry SDK of a service (traces, metrics)
    └── pino.ts                    Shared Pino logger config
```
