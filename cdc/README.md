# CDC (Change Data Capture) Workspace

This workspace provides automatic activity logging via PostgreSQL logical replication. It subscribes to database changes and creates activity records without modifying application code.

## How It Works

1. PostgreSQL streams WAL (Write-Ahead Log) changes via logical replication
2. The CDC worker subscribes to these changes using the `pgoutput` plugin
3. INSERT/UPDATE/DELETE operations are transformed into activity records
4. Activities are written to the `activities` table

## Usage

The CDC worker runs automatically as part of `pnpm dev` (alongside backend and frontend).

```bash
# Run everything together
pnpm dev

# Or run CDC worker standalone
pnpm --filter @cella/cdc dev
```
