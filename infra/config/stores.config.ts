import { defineStores } from '../lib/stores';
import { postgresManaged } from '../resources/stores/catalog';

/**
 * Registry of stateful backing resources, reaching services through runtime secrets: one managed PostgreSQL with row-level
 * security and the CDC logical-replication slot. Another store is an entry of a kind of its own; as the applied description holds each
 * entry's kind and settings, adding one deploys after an apply.
 */
export const appStores = defineStores({
  primary: postgresManaged({
    // The store owns the DSN and CA secret declarations; these map each one to its consuming services, merged ahead of runtime-secrets.config.ts.
    secretConsumers: {
      runtime: ['backend', 'yjs', 'mcp', 'oauth', 'jobs'],
      // The admin DSN migrates (the backend's release companion, which installs the job store too) and runs the jobs worker's nightly `apply_retention()`, which only the table owner may.
      admin: ['backend', 'jobs'],
      cdc: ['cdc'],
      ca: ['backend', 'yjs', 'mcp', 'cdc', 'oauth', 'jobs'],
    },
  }),
});
