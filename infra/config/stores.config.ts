import { defineStores } from '../lib/stores';
import { postgresManaged } from '../resources/stores/catalog';

/**
 * App-owned registry of stateful backing resources, reaching services through runtime secrets. The first entry is the primary store, whose
 * outputs the database access actions read. One managed PostgreSQL with row-level security and the CDC logical-replication slot; a second
 * store is one more entry, and as the applied description holds each entry's kind and settings, adding one deploys after an apply.
 */
export const appStores = defineStores({
  primary: postgresManaged({
    // The store owns the DSN and CA secret declarations; these map each one to its consuming services, merged ahead of runtime-secrets.config.ts.
    secretConsumers: {
      runtime: ['backend', 'yjs', 'mcp', 'oauth', 'jobs'],
      // The admin DSN migrates (the backend's release companion); the job store is installed there too, so no worker needs it.
      admin: ['backend'],
      cdc: ['cdc'],
      ca: ['backend', 'yjs', 'mcp', 'cdc', 'oauth', 'jobs'],
    },
  }),
});
