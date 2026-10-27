# Runbooks

This document collects the procedures for a running deployment: GeoIP data, seeding the admin, resetting or restoring the database, and tearing a stack down.

### TL;DR

Machines take no logins, so every procedure runs through the Infra CLI or the Scaleway console. Resetting the database
is a hard outage, for pre-production or a planned stop. A teardown deletes every resource to stop billing; a clean
slate only resets the stack's tracking.

## GeoIP data

Sign-ins resolve the client IP to a country and network (DB-IP Lite, CC BY 4.0) for the sessions list and the new sign-in notice. The image ships no data: each API process downloads both databases from the `geoip/` prefix of the public bucket at boot and re-checks daily with a conditional GET, so a refresh never needs a release. In development the prefix is the shared template bucket, so local sign-ins show a country out of the box (a sample public address stands in for loopback, `GEOIP_DEV_SAMPLE_IP`).

Every deploy publishes to the prefix when the data is missing or older than 35 days ([infra/tasks/geoip-refresh.ts](../../infra/tasks/geoip-refresh.ts)); `pnpm infra start-deploy` of the live target runs that check again. The deploy key writes this prefix of the public bucket and nothing else there. The task downloads from DB-IP (falling back to the previous month when the new one is not published yet), verifies every archive is a real MMDB and uploads the databases before a `manifest.json` that records the month. A failed download or a bucket problem costs only the country line; sign-ins never depend on it. `GEOIP_SOURCE_URL=off` disables the refresh, another prefix or bucket overrides the source.

## Seed the admin by hand

The machines have no login: the serial console shows a machine's output and takes no commands. The migrate companion seeds the admin on every boot of the backend machine while the users table is empty, so a wrong admin email is fixed in **Manage runtime secrets**, then by rebooting the backend machine ([Scaleway console](https://console.scaleway.com/instance/servers) → the machine → **Reboot**).

**Break-glass from your laptop.** Briefly exposes the DB (ACL-locked to your IP). It serves any operator task against the live database. For staging, **Open public DB access** → **Seed database** (`pnpm infra db-seed`) opens, seeds, and closes in one go (never on production).

1. Expose the DB (needs your operator key). The ACL defaults to `<your.ip>/32` (IPv4 only, open ranges refused) and the admin connection string is printed:

   The CLI refuses native IPv6 and `/0` entries. Entries wider than `/24` require
   `infra:dbPublicAclAllowWide=true`, and all entries together may cover at most half of IPv4.
   IPv4-mapped IPv6 addresses are normalized to the IPv4 range they name.

   ```bash
   pnpm infra db-open
   ```

2. Seed locally:

   ```bash
   ADMIN_EMAIL=you@example.com DATABASE_ADMIN_URL='<printed connection string>' pnpm --filter backend seed:production init
   ```

3. **Close the endpoint again** (and revoke a pasted key). A deploy does not close it. The close deletes the public endpoint over the RDB API and re-reads the instance until it has none; the menu offers it whenever the live instance has a public endpoint, and `pnpm infra status` warns about one (`db.publicEndpoint`):

   ```bash
   pnpm infra db-close
   ```

## Reset the database

Rebuilds the app's logical database from migrations plus the admin seed. **Pre-production only, or with services deliberately quiesced: a hard outage.** `pnpm infra` → **Reset database** takes a backup (aborting unless it reports ready), deletes and recreates the logical database over the Scaleway API with your operator key, and re-grants both roles. It never exposes the database and never runs `pulumi up`. Then reboot the backend machine ([Scaleway console](https://console.scaleway.com/instance/servers) → the machine → **Reboot**): every boot runs the migrate companion, which migrates the empty database and seeds the admin from the `admin-email` runtime secret while the users table is empty ([main.migrate.ts](../../backend/src/main.migrate.ts)).

Verify: `curl https://<your-app>/api/health?depth=full` reports every component `healthy`. A recreated or restored database has no replication slot: the CDC worker makes one, rebuilds its sync books and every connected client refetches (a `sync_incidents` row with reason `lost_slot`).

- **Nothing but you stops this.** Scaleway's API deletes a live database with connected clients and an active replication slot. The typed `<database>@<instance>` confirmation is the only guard.
- **Re-granting is mandatory, and the task owns it.** Deleting a database drops its Scaleway privileges. Neither a recreate nor a backup restore brings them back (`pg_dump` carries table ACLs, not database-level ones), so without it `CONNECT` is absent and the app reports `database_unreachable`.
- If the task fails after the delete, it prints the exact `scw rdb backup restore` command plus the two `privilege set` calls a restore does not perform.

## Restore a backup

A backup holds the accounts deleted after it was taken, and a deletion someone asked for has to hold on the restored database too. A deleted account leaves its `actors` row behind, so the live database lists them. Before restoring, save that list:

```sql
SELECT a.id FROM actors a LEFT JOIN users u ON u.id = a.id WHERE a.kind = 'user' AND u.id IS NULL;
```

Restore and re-grant both roles as above, then delete those accounts again. Their sessions go with the `users` rows:

```sql
DELETE FROM oidc_payloads WHERE account_id = ANY($1);
DELETE FROM users WHERE id = ANY($1);
UPDATE actors SET last_seen_at = NULL, last_sign_in_at = NULL WHERE id = ANY($1);
```

## Teardown

`pnpm infra` → **Tear down stack** deletes every resource to stop billing: it requires typing `<slug>-<mode>`, runs `pulumi destroy --refresh` under the stack lock with your operator key, then optionally deletes the stack's IAM principals, for which it asks for an Owner API key ([API keys](./KEYS.md#api-keys)). The app's operator application stays: it serves the other environments. Production resources marked `protect: true` (frontend/private buckets, database) are refused unless protection is lifted in code first. Left in place on purpose: the versioned state bucket and operator secret values.

> **Clean slate** below is not a teardown: it resets stack tracking to set up a still-running stack again. Live resources stay.

## Clean slate

1. `rm infra/Pulumi.<stack>.yaml`
2. (optional) Scaleway console → Object Storage → delete bucket `<slug>-pulumi-state` (names stay reserved for several hours).
3. (optional) Revoke a pasted setup key in the Scaleway console.
4. (optional) Delete IAM application `<slug>-<mode>-ci-deploy` and its policy.
5. Re-run: `pnpm infra`
