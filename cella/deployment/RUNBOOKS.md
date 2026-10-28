# Runbooks

This document collects the procedures for a running deployment: a failed deploy, a stale stack lock, GeoIP data, database access, seeding the admin, resetting or restoring the database, and tearing a stack down.

### TL;DR

Machines take no logins, so every procedure runs through the Infra CLI or the Scaleway console. Resetting the database
is a hard outage, for pre-production or a planned stop. A teardown deletes every resource to stop billing; a clean
slate only resets the stack's tracking.

## Debug a failed deploy

Start with `pnpm infra runs` (`--mode staging` for staging): a failed run shows the step that failed and a failed machine's boot error ([Run records](../DEPLOYMENT.md#run-records)). A cutover that times out waiting for the new version means the app never served it: almost always a crash at boot, not the load balancer.

1. **Read the boot accounts first.** `pnpm infra runs --sha <sha>` prints each machine's boot account of that release with the builder's report: the boot phases, the migrate companion's output and a crashed container's output. "No account" means the boot runner never finished; then the machine's serial console (Scaleway console → Instances → the machine → Console) shows how far it got, up to `BOOT FAILED (exit N)`.
2. **Reproduce locally.** Pull the exact image tag and `docker run` it with a minimal valid environment: a failing import (`ERR_MODULE_NOT_FOUND`) shows in seconds. On macOS, where the keychain refuses to save a `docker login`, use a throwaway `--config` folder with a base64 `auth`.
3. **Check the usual causes:**
   - a package the image lacks: `pnpm boot:check` catches one missing from `dependencies`
   - a secret value of several lines ([Runtime secret delivery](../DEPLOYMENT.md#runtime-secret-delivery))
   - an image older than a change to the database or the secrets it expects
   - node-postgres checking the TLS hostname against the IP it dialed
   - a service key without `SecretManagerSecretAccess` on its folder: a 403 while hydrating
   - an instance-type quota too low for a new machine beside the old one

A fix to `infra/` passes `pnpm --filter infra exec vitest run` and `pnpm check` before it ships.

## A stale stack lock

A deploy or an operator action that dies holds its stack lock until the lock's lease lapses, within minutes, and the next run waits for it. `pnpm infra status` reports the lock and any operation the interrupted Pulumi run left in the state.

1. `pnpm infra` → **Repair stack** → **Unlock stack** (`pnpm infra unlock`) removes an expired lock at once, and a live one only after you confirm. A live lock most likely belongs to a run that is still going: check `pnpm infra runs` first.
2. It then lists the interrupted operations. When all of them are creates, it offers to drop them and keeps a state export in `infra/.state-backups/` as the rollback. Check the Scaleway console for each resource first: a create that went through left a resource the state does not track.
3. An interrupted update or delete stays: run the `pulumi refresh` that Unlock prints.

## GeoIP data

Sign-ins resolve the client IP to a country and network (DB-IP Lite, CC BY 4.0) for the sessions list and the new sign-in notice. The image ships no data: each API process downloads it from the `geoip/` prefix of the public bucket at boot and checks daily for newer data, so a refresh needs no release. In development the prefix is the shared template bucket, so local sign-ins show a country out of the box.

Every deploy refreshes stale data ([geoip-refresh.ts](../../infra/tasks/geoip-refresh.ts)); `pnpm infra start-deploy` of the live target runs that check again. A failed download or a bucket problem costs only the country line; sign-ins never depend on it. `GEOIP_SOURCE_URL=off` disables the refresh, another prefix or bucket overrides the source.

## Open the database

Break-glass access from your laptop, for any operator task against the live database: the CLI exposes the database briefly, on your operator key, behind an ACL that defaults to your own IPv4 address.

1. Open it. The CLI prints the admin connection string:

   ```bash
   pnpm infra db-open
   ```

2. Run your task with that connection string.
3. **Close it again**: a deploy does not. The menu offers the close while the endpoint is open, and `pnpm infra status` warns about it.

   ```bash
   pnpm infra db-close
   ```

## Seed the admin by hand

A wrong admin email is fixed in **Manage runtime secrets**, then by rebooting the backend machine ([Scaleway console](https://console.scaleway.com/instance/servers) → the machine → **Reboot**): its boot seeds the admin while the users table is empty ([Sign in as first admin](./FRESH_INSTALLATION.md#5-sign-in-as-first-admin)).

On staging, **Open public DB access** → **Seed database** (`pnpm infra db-seed`) opens the database, seeds and closes it in one go; it never runs on production. Elsewhere, [open the database](#open-the-database) and seed with the printed connection string:

```bash
ADMIN_EMAIL=you@example.com DATABASE_ADMIN_URL='<printed connection string>' pnpm --filter backend seed:production init
```

## Reset the database

Rebuilds the app's logical database from migrations plus the admin seed. **Pre-production only, or with services deliberately quiesced: a hard outage.**

`pnpm infra` → **Reset database** takes a backup, deletes and recreates the logical database with your operator key, and re-grants both roles. Then reboot the backend machine ([Scaleway console](https://console.scaleway.com/instance/servers) → the machine → **Reboot**): its boot migrates the empty database and seeds the admin.

Verify: `curl https://<your-app>/api/health?depth=full` reports every component `healthy`. A recreated or restored database has no replication slot, so the CDC worker rebuilds its sync books ([Verify and rebuild](../../cdc/README.md#verify-and-rebuild)).

- **Nothing but you stops this.** Scaleway's API deletes a live database with connected clients and an active replication slot. The typed `<database>@<instance>` confirmation is the only guard.
- **Re-granting is mandatory.** Deleting a database drops its Scaleway privileges, and a restore does not bring them back: without the re-grant the app reports `database_unreachable`. If the task fails after the delete, it prints the restore and re-grant commands of the next section.

## Restore a backup

A backup holds the accounts deleted after it was taken, and a deletion someone asked for has to hold on the restored database too. A deleted account leaves its `actors` row behind, so the live database lists them. Before restoring, save that list:

```sql
SELECT a.id FROM actors a LEFT JOIN users u ON u.id = a.id WHERE a.kind = 'user' AND u.id IS NULL;
```

Restore the backup, then re-grant both roles:

```bash
scw rdb backup restore <backup-id> instance-id=<instance-id> database-name=<database> region=<region>
scw rdb privilege set instance-id=<instance-id> region=<region> database-name=<database> user-name=admin_role permission=all
scw rdb privilege set instance-id=<instance-id> region=<region> database-name=<database> user-name=runtime_role permission=all
```

Then delete those accounts again. Their sessions go with the `users` rows:

```sql
DELETE FROM oidc_payloads WHERE account_id = ANY($1);
DELETE FROM users WHERE id = ANY($1);
UPDATE actors SET last_seen_at = NULL, last_sign_in_at = NULL WHERE id = ANY($1);
```

## Teardown

`pnpm infra` → **Tear down stack** asks you to type `<slug>-<mode>`, then deletes every resource to stop billing, with your operator key. It then offers to delete the stack's IAM principals, for which it asks for an Owner API key ([API keys](./KEYS.md#api-keys)). The app's operator application stays: it serves the other environments. Production resources marked `protect: true` (frontend/private buckets, database) are refused unless protection is lifted in code first. Left in place on purpose: the versioned state bucket and operator secret values.

> **Clean slate** below is not a teardown: it resets stack tracking to set up a still-running stack again. Live resources stay.

## Clean slate

1. `rm infra/Pulumi.<stack>.yaml`
2. (optional) Scaleway console → Object Storage → delete bucket `<slug>-pulumi-state` (names stay reserved for several hours).
3. (optional) Revoke a pasted setup key in the Scaleway console.
4. (optional) Delete IAM application `<slug>-<mode>-ci-deploy` and its policy.
5. Re-run: `pnpm infra`
