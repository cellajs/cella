# CDC (Change Data Capture) Workspace

This workspace provides automatic activity logging via PostgreSQL logical replication. It subscribes to database changes and creates activity records without modifying application code.

## How It Works

1. PostgreSQL streams WAL (Write-Ahead Log) changes via logical replication
2. The CDC worker subscribes to these changes using the `pgoutput` plugin
3. INSERT/UPDATE/DELETE operations are transformed into activity records
4. Activities are written to the `activities` table

## Prerequisites: WAL Configuration

CDC requires `wal_level=logical` on your PostgreSQL instance. This must be configured manually.

### Local development (Docker Compose)

Already configured in `compose.yaml`:

```yaml
command:
  - -c
  - wal_level=logical
  - -c
  - max_wal_senders=10
  - -c
  - max_replication_slots=10
```

### Production

```sql
ALTER SYSTEM SET wal_level = 'logical';
ALTER SYSTEM SET max_wal_senders = 10;
ALTER SYSTEM SET max_replication_slots = 10;
SELECT pg_reload_conf();

-- To prevent unbounded WAL growth:
ALTER SYSTEM SET max_slot_wal_keep_size = '10GB';
SELECT pg_reload_conf();
```

### CI

Add to your CI workflow before running migrations:

```yaml
- name: Configure Postgres for logical replication
  run: |
    PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "ALTER SYSTEM SET wal_level = 'logical';"
    PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "ALTER SYSTEM SET max_wal_senders = 10;"
    PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "ALTER SYSTEM SET max_replication_slots = 10;"
    PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "SELECT pg_reload_conf();"
```

## Usage

The CDC worker runs automatically as part of `pnpm dev` (alongside backend and frontend).

```bash
# Run everything together
pnpm dev

# Or run CDC worker standalone
pnpm --filter @cella/cdc dev
```
