# Recalculate counters (production)

Rebuilds `context_counters` and `product_counters` from source-of-truth tables. Idempotent — safe to run any time (e.g. after a dump/restore migration or if counters drift).

The seed is defined in [backend/scripts/seeds/50-counters.seed.ts](../backend/scripts/seeds/50-counters.seed.ts) and is gated with `allowProduction: true`. It calls `recalculateCounters(db)` from [backend/src/modules/entities/helpers/recalculate-counters.ts](../backend/src/modules/entities/helpers/recalculate-counters.ts).

## Run it (Scaleway serial console)

The production VMs have no SSH listener by design (security group inbound is `drop`, break-glass is the serial console). To run the seed:

1. Open the Scaleway console → **Instances** → region `nl-ams-1` → `rak-backend`.
2. Click **Console** (serial console, top-right). Log in as `root` (cloud-init configures passwordless root on the serial TTY).
3. Exec into the running backend container and run the seed:

   ```bash
   docker exec -it $(docker ps --filter name=backend -q) pnpm seed counters
   ```

4. Expected output ends with:

   ```
   Recalculated counters for <N> context entities, <M> product entities
   ```

5. Close the console tab.

## Verify

```bash
curl -s https://api.raak.dev/health?depth=full | jq '.status, .checks.database'
```

Should report `healthy`. Counters drift will not show up in `/health` directly — spot-check by loading an org page in the app and confirming entity/member counts match expectations.

## Notes

- The seed uses the admin DB connection (`seedDb`) and runs phases 1–4: org membership/entity counts, sub-org contexts, sequence counters from `MAX(seq)`, product counters.
- `ON CONFLICT … DO UPDATE` means re-runs are cheap and non-destructive.
- If you ever need a non-interactive path, add a guarded `POST /internal/recalculate-counters` route (same `x-cdc-secret` pattern as `/internal/cdc`) and call it from a `workflow_dispatch` job.
