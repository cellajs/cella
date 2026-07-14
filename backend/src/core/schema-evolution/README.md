# core/schema-evolution

Backend server-side seams for the schema-evolution (version-tolerance) system.

The **engine** — lens modules, the doba facade, key-map derivation, the global
schema version — lives in [`shared/src/schema-evolution`](../../../../shared/src/schema-evolution),
because frontend, cdc, and backend all consume it. This folder is the backend's
thin **layer** on top of that engine:

- **`evolution-contract.ts`** — one registration point per entity module
  (`evolutionContract.product` / `.context`): version-tolerant create/update body
  schemas + entity-bound runtime seams. CI-enforced complete (`lens:check` rule 4,
  "contract completeness").
- **`lens-seam.ts`** — runtime body seams (`normalizeBody`, `normalizeCreateItem`)
  and build-time widening (`widenBodySchema`).
- **`update-schema.ts`** — builds the lens-widened `{ ops, stx }` product update schema.

The sync/CRDT engine this layers onto (HLC, AWSet, `resolveUpdateOps`) stays in
[`../stx`](../stx) — it is the sync-transaction engine, not schema evolution, and
merely calls the seam here. The dependency is strictly one-way:
**`schema-evolution` → `stx` → `shared`**.

Full design, decisions, and shipping playbook:
[Schema evolution](../../../../cella/SCHEMA_EVOLUTION.md).
