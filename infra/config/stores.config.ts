import { defineStores } from '../lib/stores'
import { postgresManaged } from '../resources/stores/postgres-managed'

/**
 * App-owned registry of stateful backing resources, provisioned by the deploy
 * engine and wired into services via runtime secrets. The first entry is the
 * primary store (its outputs feed the stack's `db*` exports).
 *
 * cella's default is a single managed PostgreSQL with row-level security and the
 * CDC logical-replication slot. An app swaps this for a managed MySQL/Redis, an
 * external `databaseUrl` (any Drizzle-compatible URL: Neon, Turso, Supabase,
 * PlanetScale), or `none`, without touching engine code.
 */
export const appStores = defineStores({
  primary: postgresManaged({
    roles: ['admin', 'runtime', 'cdc'],
    logicalReplication: true,
    // The store owns the DSN/CA secret declarations; this maps each one to its
    // consuming services. They merge ahead of runtime-secrets.config.ts.
    secretConsumers: {
      runtime: ['backend', 'yjs', 'mcp'],
      admin: ['backend', 'mcp'],
      cdc: ['cdc'],
      ca: ['backend', 'yjs', 'mcp', 'cdc'],
    },
  }),
})
