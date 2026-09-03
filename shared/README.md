# shared

Shared configuration, types, permissions, and utilities used by all packages.

`config/config.default.ts` holds the full base config. Mode files (`config/config.development.ts`, etc.) provide partial overrides merged via `mergeDeep` into the exported `appConfig`. To add a mode: add it to `ConfigMode` in `types.ts`, create the config file in `shared/config/`, and register it in `app-config.ts`. `config-validation.ts` checks at compile time that config arrays match the hierarchy.

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
