import { defineStores } from '../lib/stores';
import { postgresManaged } from '../resources/stores/catalog';

/**
 * App-owned registry of stateful backing resources, reaching services through runtime secrets. The first entry is the primary store and its outputs feed the stack's `db*` exports.
 * The template default is one managed PostgreSQL with row-level security and the CDC logical-replication slot; an app swaps it for a managed alternative, an external `databaseUrl`, or `none`, without touching engine code.
 */
export const appStores = defineStores({
  primary: postgresManaged({
    roles: ['admin', 'runtime', 'cdc'],
    logicalReplication: true,
    // The store owns the DSN and CA secret declarations; these map each one to its consuming services, merged ahead of runtime-secrets.config.ts.
    secretConsumers: {
      runtime: ['backend', 'yjs', 'mcp'],
      admin: ['backend', 'mcp'],
      cdc: ['cdc'],
      ca: ['backend', 'yjs', 'mcp', 'cdc'],
    },
  }),
});
