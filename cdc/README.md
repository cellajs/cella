# CDC (Change Data Capture)

Automatic activity logging via PostgreSQL logical replication. Subscribes to WAL changes (INSERT/UPDATE/DELETE) via the `pgoutput` plugin, transforms them into activity records, and writes them to the `activities` table. Runs as part of `pnpm dev` or standalone with `pnpm --filter cdc dev`.

## Internal service only

The CDC worker is a **server-to-server** component co-located with the API server (same host/pod/network). The WebSocket channel carries full entity row data for the real-time sync pipeline. Never expose `/internal/cdc` to external networks or browser clients.

Security layers: path isolation (`/internal/cdc` only), shared secret (`CDC_SECRET`, min 16 chars), loopback enforcement in production (127.0.0.1/::1), single-connection limit, 90s idle timeout.

## WAL configuration

Requires `wal_level=logical`. Already set in `compose.yaml` for local dev. For production:

```sql
ALTER SYSTEM SET wal_level = 'logical';
ALTER SYSTEM SET max_wal_senders = 10;
ALTER SYSTEM SET max_replication_slots = 10;
ALTER SYSTEM SET max_slot_wal_keep_size = '10GB';
SELECT pg_reload_conf();
```

For CI, run equivalent `ALTER SYSTEM` commands before migrations.

## Related docs

- [Architecture overview](../info/ARCHITECTURE.md)
- [Sync engine](../info/SYNC_ENGINE.md)
