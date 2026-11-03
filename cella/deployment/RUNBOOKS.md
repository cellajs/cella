# Runbooks

This document collects the procedures for a running deployment: a failed or blocked deploy, a stale stack lock, GeoIP data, database access, a stopped CDC worker, seeding the admin, resetting or restoring the database, and tearing a stack down.

### TL;DR

Machines take no logins, so every procedure runs through the Infra CLI or the Scaleway console. Resetting the database
is a hard outage, for pre-production or a planned stop. A teardown deletes everything that runs or costs and keeps what
cannot be made again, which a setup adopts; a clean slate deletes that too.

## Debug a failed deploy

Start with `pnpm infra runs` (`--mode staging` for staging): a failed run shows the step that failed and a failed machine's boot error. A cutover that times out waiting for the new version means the app never served it: almost always a crash at boot, not the load balancer.

1. **Read the boot accounts first.** `pnpm infra runs --sha <sha>` prints each machine's boot account of that release with the builder's report: the boot phases, the migrate companion's output and a crashed container's output. "No account" means the boot runner never finished; then the machine's serial console (Scaleway console → Instances → the machine → Console) shows how far it got, up to `BOOT FAILED (exit N)`.
2. **Reproduce locally.** Build the image at the release's commit, or `docker load` its archive from `releases/<sha>/images/` of the boot-diag bucket, and `docker run` it with a minimal valid environment: a failing import (`ERR_MODULE_NOT_FOUND`) shows in seconds.
3. **Check the usual causes:**
   - a package the image lacks: `pnpm boot:check` catches one missing from `dependencies`
   - a secret value of several lines ([Runtime secret delivery](../DEPLOYMENT.md#runtime-secret-delivery))
   - an image older than a change to the database or the secrets it expects
   - node-postgres checking the TLS hostname against the IP it dialed
   - a link that ended before the machine fetched it: a 403 at `fetch-env` or `load-images`, when the machine took longer than the link's minutes to boot
   - an instance-type quota too low for a new machine beside the old one

## A blocked deploy

A blocked run made no machine, and the running release stays. `pnpm infra runs` names what it owes:

- **Identities differ:** **Update identities** (`pnpm infra identity`, Owner API key), then `pnpm infra start-deploy`, as the update starts no deploy.
- **A privileged change:** **Review & apply changes** (`pnpm infra apply`), which starts the target again at its end. A change to the database's ACL means its public endpoint is open: [close it](#open-the-database), then `pnpm infra start-deploy`.
- **An empty required secret:** store it in **Manage runtime secrets** (`pnpm infra secrets`), which starts the target again.

The runner never starts a blocked target again.

## A stale stack lock

A deploy or an operator action that dies holds its stack lock until the lock's lease lapses, within minutes, and the next run waits for it. `pnpm infra status` reports the lock and, once the session holds the operator key, any operation the interrupted Pulumi run left in the state.

1. `pnpm infra` → **Repair stack** → **Unlock stack** (`pnpm infra unlock`) removes an expired lock at once, and a live one only after you confirm. A live lock most likely belongs to a run that is still going: check `pnpm infra runs` first.
2. It then lists the interrupted operations. When all of them are creates, it offers to drop them and keeps a state export in `infra/.state-backups/` as the rollback. Check the Scaleway console for each resource first: a create that went through left a resource the state does not track.
3. An interrupted update or delete stays: run the `pulumi refresh` that Unlock prints, logged in with the operator key and with the passphrase from the environment's `/engine/` secret folder.

## GeoIP data

Sign-ins resolve the client IP to a country and network (DB-IP Lite, CC BY 4.0) for the sessions list and the new sign-in notice. The image ships no data: each API process downloads it from the `geoip/` prefix of the public bucket at boot and checks daily for newer data, so a refresh needs no release.

Every deploy refreshes stale data; `pnpm infra start-deploy` of the live target runs that check again. A failed download or a bucket problem costs only the country line; sign-ins never depend on it. `GEOIP_SOURCE_URL=off` disables the refresh, another prefix or bucket overrides the source.

## Open the database

Break-glass access from your laptop, for any operator task against the live database: the CLI exposes the database briefly, on your operator key, behind an ACL that defaults to your own IPv4 address.

1. Open it. The CLI prints the admin connection string:

   ```bash
   pnpm infra db-open
   ```

2. Run your task with that connection string.
3. **Close it again**: a deploy does not, and while it is open every deploy ends blocked at the preflight. The menu offers the close while the endpoint is open, and `pnpm infra status` warns about it.

   ```bash
   pnpm infra db-close
   ```

While it is open, **Review & apply changes** (`pnpm infra apply`) refuses to run, as it would remove the ACL and keep the endpoint: close it first.

## A stopped CDC worker

A stopped CDC worker's replication slot keeps WAL until the database volume fills. When the worker cannot be brought back, [open the database](#open-the-database) and drop the slot:

```sql
SELECT pg_drop_replication_slot('cdc_slot');
```

The worker makes a new slot when it starts again, and every client refetches once.

## Seed the admin by hand

A wrong admin email is fixed in **Manage runtime secrets**, then by a deploy that makes a new backend machine, such as **Rotate secrets**: a machine keeps the env file it booted with, and the new one's boot seeds the admin while the users table is empty.

On staging, **Open public DB access** → **Seed database** (`pnpm infra db-seed`) opens the database, seeds demo data with the admin and closes it in one go; it never runs on production. Elsewhere, [open the database](#open-the-database), build the backend and seed with the printed connection string:

```bash
pnpm --filter backend build
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

`pnpm infra` → **Tear down stack** asks you to type `<slug>-<mode>` and for an Owner API key that expires within a day, and nothing else: the Owner key holds every right, so the one key deletes the resources and the identities. It refuses a key the bucket policies do not name, before it touches anything: your user joins `<app>-operators`, and the next **Review & apply changes** names you.

It deletes the machines, the load balancer with its address, the DNS records, the private network, the security groups, the database, the main job, the registry namespace, every secret container but the keys that protect stored data, and the environment's identities: the deploy and uploads applications with their policies and keys, and the `<slug>-<mode>` group. The app's operators, observer and runner stay: they serve the other environments.

Before the database goes, it writes a **final dump** into the boot-diag bucket, under `dumps/<mode>/<time>`, from a backup Scaleway makes and keeps a few days. Neither the uploads key nor the observer reads there. When the dump fails, nothing of the stack is destroyed, and the teardown says what it did before. A write the app takes after the dump is lost, so stop traffic first.

A destroy that stops halfway leaves what it had not reached, still in the state, and the kept resources already out of it: tear down again to finish.

It keeps, with their contents: the two upload buckets, the boot-diag bucket with the run records, the state bucket, and the `data-encryption-key` and `pii-hash-secret` containers in `/runtime/`, without which the dump's encrypted and hashed fields no longer read. Each kept bucket keeps its policy. Third-party keys go with the other secrets: a setup again asks for them.

The project id stays in `infra/.env.<mode>`. Commit the deletion of `infra/Pulumi.<mode>.yaml`, drop the environment from `infra/runner.json` and **Replace the runner**. A setup again (`pnpm infra --mode <mode>`) runs in the same project and adopts what was kept before its first apply, so that apply changes nothing about them.

## Restore the final dump

The dump is the file Scaleway exports from a backup, a `pg_dump` archive. Download it with a key the boot-diag bucket admits (the operator key, or the console: Object Storage → `<slug>-boot-diag` → `dumps/`), open the database ([Open the database](#open-the-database)) and restore it as the admin role:

```bash
pg_restore --no-owner --no-privileges --dbname "<admin connection string>" <file>
```

A dump restored into a setup again reads its encrypted fields only with the kept `data-encryption-key` and `pii-hash-secret`. Delete the accounts deleted after the dump as in [Restore a backup](#restore-a-backup).

## Clean slate

To leave nothing of a torn-down environment, delete in the console what the teardown kept:

1. Object Storage: the two upload buckets, the boot-diag bucket and `<slug>-pulumi-state`, emptied first. Bucket names stay reserved for several hours.
2. Secret Manager, the environment's project: `data-encryption-key` and `pii-hash-secret` in `/runtime/`. With them goes every encrypted field of the final dump.
3. The `SCW_PROJECT_ID` line of `infra/.env.<mode>`, and the project itself if nothing else lives in it.
4. Revoke the Owner API key you pasted.

The next `pnpm infra --mode <mode>` then sets the environment up from nothing.
