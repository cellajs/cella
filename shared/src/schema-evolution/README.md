# shared/src/schema-evolution

The lens registry and engine. What a lens is and how a breaking change ships: [Schema evolution](../../../cella/SCHEMA_EVOLUTION.md).

| File | Holds |
| --- | --- |
| [define.ts](./define.ts) | `defineLens` and the delta kinds a lens can declare |
| [lens-list.ts](./lens-list.ts) | The append point. Never reorder or remove an entry: a lens's index + 1 is its global schema ordinal. |
| [engine.ts](./engine.ts) | The only module that imports `dobajs`, so the dependency stays swappable. Per entity type with lenses it builds the cache-row migrations and the key maps for `ops` and `stx.fieldTimestamps`; with no lenses every export passes data through unchanged. |
| [config.ts](./config.ts) | Policy values for the expand window and unknown fields |
| [schema-evolution.ts](../schema-evolution.ts) | The `shared/schema-evolution` entry the backend and frontend read. Lens modules, tests and `lens:check` import the files here by path. |
