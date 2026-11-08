# Runbooks

This document collects the procedures for a running deployment: a failed or blocked deploy, one that needs an apply, a stale lease, GeoIP data, database access, a stopped CDC worker, seeding the admin, resetting or restoring the database, and tearing a stack down.

### TL;DR

Machines take no logins, so every procedure runs through the Infra CLI or the Scaleway console. Resetting the database
is a hard outage, for pre-production or a planned stop. A teardown deletes everything that runs or costs and keeps what
cannot be made again for the next setup. A clean slate deletes that too.

## Debug a failed deploy

Start with `pnpm infra runs`, adding `--mode staging` for staging. A failed run shows the step that failed and a failed machine's boot error.

A switch that times out waiting for the new machine means its agent never answered 200. That is almost always a crash at boot, not the load balancer.

The deploy deleted the new machine, and the old one kept serving. A role that switched before the failure serves the target. The next run of the same target switches only the rest.

1. **Read the boot accounts first.** `pnpm infra runs --sha <sha>` prints each machine's boot account of that release with the builder's report, a crashed container's output included. "No account" means the agent never finished its boot. The machine's serial console then shows how far it got: Scaleway console → Instances → the machine → Console. A deleted machine's console is gone with it. For a boot that never reports, start the same target with a raised retry counter and read the console while the deploy waits.
2. **Reproduce locally.** Build the image at the release's commit, or `docker load` its archive from `releases/<sha>/images/` in the boot-diag bucket. `docker run` it with a minimal valid environment. A failing import such as `ERR_MODULE_NOT_FOUND` shows in seconds.
3. **Check the usual causes:**
   - a package the image lacks: `pnpm boot:check` catches one missing from `dependencies`
   - a secret value of several lines ([Runtime secret delivery](../DEPLOYMENT.md#runtime-secret-delivery))
   - an image older than a change to the database or the secrets it expects
   - node-postgres checking the TLS hostname against the IP it dialed
   - a link that ended before a slow boot fetched it: a 403 at `fetch-env` or `load-images`
   - an instance-type quota too low for a new machine beside the old one
   - "an apply makes it": run **Review & apply changes**, then the same target

## A blocked deploy

A blocked run booted no machine of the release, so the running release stays. `pnpm infra runs` names the empty required secret it owes. What stores it depends on its kind:

- **An operator value:** **Manage runtime secrets** (`pnpm infra secrets`), which starts the target again.
- **A generated or database value:** **Review & apply changes** (`pnpm infra apply`).
- **The uploads key:** **Update identities**.

No scheduled run starts a blocked target again. Storing the value or the apply does.

## Apply needed

A run ends **apply needed** when its target describes the app otherwise than the engine the last apply published ([What needs an apply](./CHANGING_INFRASTRUCTURE.md#what-needs-an-apply)). The run stopped before it read a runtime value or booted a machine of the release, so the running release stays. `pnpm infra runs` shows the end with the target's and the applied description's hashes.

1. Check out the target's commit, for production its release tag. Run **Review & apply changes** (`pnpm infra apply --mode <env>`). It publishes that checkout's engine and starts the target again at its end.
2. "did not start from the engine image an apply publishes" means the run started on a definition older than the applied engine. The apply in step 1 rewrites it.
3. "reports no description" means the target is older than the applied engine, which cannot deploy it. Pin a newer release, or roll forward.
4. "The image describes … the apply as …" during the apply's build has two causes. The apply's shell overrides the config, such as `APP_ORIGIN`, or the description needs a file git does not track. Unset the override or `git add` the file, then apply again.

**Show status** compares the main job's image with the digest `applied.json` names in its **Main job** check.

## A stale lease

A deploy or an operator action that dies holds its lease until it lapses within minutes. The next run waits for it, and `pnpm infra status` reports it.

1. `pnpm infra` → **Repair stack** → **Unlock stack** (`pnpm infra unlock`) removes an expired lease at once. It removes a live one only after you confirm. A live lease most likely belongs to a run still going, so check `pnpm infra runs` first.
2. A deploy that died mid-switch may have left a machine on the idle slot. The next deploy drains and deletes it before it boots there, so you owe nothing for it.
3. Unlock then lists the operations an interrupted apply left in the Pulumi state. When all of them are creates, it offers to drop them. It keeps a state export in `infra/.state-backups/` as the rollback. Check the Scaleway console for each resource first. A create that went through left a resource the state does not track.
4. An interrupted update or delete stays. Run the `pulumi refresh` that Unlock prints, logged in with the operator key and the passphrase from the environment's `/engine/` secret folder.
5. An apply may fail to delete a resource the program no longer declares, as its live object is gone already. **Remove from state** (`pnpm infra state-prune`) takes its URN out of the state.

## GeoIP data

Sign-ins resolve the client IP to a country and network with DB-IP Lite data, under CC BY 4.0. The sessions list and the new sign-in notice show them. The image ships no data. Each API process downloads it from the `geoip/` prefix of the public bucket at boot and checks for newer data, so a refresh needs no release.

Every deploy refreshes stale data, and `pnpm infra start-deploy` of the live target runs that check again. A failed download or a bucket problem costs only the country line. Sign-ins never depend on it. `GEOIP_SOURCE_URL=off` disables the refresh, and another prefix or bucket as its value overrides the source.

## Open the database

This is break-glass access from your laptop, for any operator task against the live database. The CLI exposes the database briefly on your operator key. Its ACL defaults to your own IPv4 address.

1. Open it. The CLI prints the admin connection string:

   ```bash
   pnpm infra db-open
   ```

2. Run your task with that connection string.
3. **Close it again.** A deploy does not close it. The menu offers the close while the endpoint is open, and `pnpm infra status` warns about it.

   ```bash
   pnpm infra db-close
   ```

While it is open, **Review & apply changes** (`pnpm infra apply`) refuses to run. Its plan would remove the ACL and keep the endpoint, so close it first.

## A stopped CDC worker

A stopped CDC worker's replication slot keeps WAL until the database volume fills. When the worker cannot be brought back, [open the database](#open-the-database) and drop the slot:

```sql
SELECT pg_drop_replication_slot('cdc_slot');
```

The worker makes a new slot when it starts again. Every client then refetches once.

## Seed the admin by hand

Fix a wrong admin email in **Manage runtime secrets**. Then run a deploy that makes a new backend machine, such as **Rotate secrets**. A machine keeps the env file it booted with. The new machine's boot seeds the admin while the users table is empty.

On staging, **Open public DB access** → **Seed database** (`pnpm infra db-seed`) seeds demo data with the admin. It opens the database, seeds and closes it in one go. It never runs on production. Elsewhere, [open the database](#open-the-database). The migrate companion seeds the admin on an empty users table. Build the backend and run it with the printed connection string:

```bash
pnpm --filter backend build
ADMIN_EMAIL=you@example.com DATABASE_ADMIN_URL='<printed connection string>' SERVICE=migrate node backend/dist/main.js
```

## Reset the database

**Reset database** rebuilds the app's logical database from migrations plus the admin seed. **Pre-production only, or with services deliberately quiesced: a hard outage.**

`pnpm infra` → **Reset database** takes a backup, deletes and recreates the logical database, and re-grants both roles. It runs on your operator key. Then reboot the backend machine: [Scaleway console](https://console.scaleway.com/instance/servers) → the machine → **Reboot**. Its boot migrates the empty database and seeds the admin.

Verify that `curl https://<your-app>/api/health?depth=full` reports every component `healthy`. A recreated or restored database has no replication slot, so the CDC worker rebuilds its sync books ([Verify and rebuild](../../cdc/README.md#verify-and-rebuild)).

- **Nothing but you stops this.** Scaleway deletes a database in use, replication slot included.
- **The typed name is the only guard.** You confirm by typing `<database>@<instance>`.
- **Re-granting is mandatory.** After a delete or a restore, the app reports `database_unreachable` until then.
- **A failure after the delete prints the fix.** It names the restore and re-grant commands below.

## Restore a backup

A backup holds the accounts deleted after it was taken. A deletion someone asked for must hold on the restored database too. A deleted account leaves its `actors` row behind, so the live database lists them. Before restoring, save that list:

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

`pnpm infra` → **Tear down stack** asks you to type `<slug>-<mode>`. It asks for one key and nothing else: an Owner API key that expires within a day. The Owner key holds every right, so the one key deletes the resources and the identities.

Before it touches anything, it refuses a key the bucket policies do not name. Your user is named once it joins `<app>-operators` and the next **Review & apply changes** runs.

It deletes:

- every machine the deploys and the builder made, with the reserved addresses they held
- the load balancer with its address, and the DNS records
- the private network and the security groups
- the database, the main job and the registry namespace
- every secret container but the keys that protect stored data
- the deploy and uploads applications with their policies and keys
- the `<slug>-<mode>` group

The app's operators and observer stay, since they serve the other environments.

Before the database goes, the teardown writes a **final dump** into the boot-diag bucket under `dumps/<mode>/<time>`. The dump comes from a backup Scaleway makes and keeps a few days. Neither the uploads key nor the observer reads there.

When the dump fails, the teardown destroys nothing of the stack and says what it did before. A write the app takes after the dump is lost, so stop traffic first.

A destroy that stops halfway leaves what it had not reached in the state. Tear down again to finish.

It keeps these, with their contents:

- the two upload buckets
- the boot-diag bucket with the run records and the rotations
- the state bucket
- the `data-encryption-key` and `pii-hash-secret` containers in `/runtime/`

Each kept bucket keeps its policy. Without the two kept keys, the dump's encrypted and hashed fields no longer read. The live record goes with the machines it named. Third-party keys go with the other secrets, so a setup again asks for them.

The project id stays in `infra/.env.<mode>`. Commit the deletion of `infra/Pulumi.<mode>.yaml`. A setup again (`pnpm infra --mode <mode>`) runs in the same project. It adopts what the teardown kept before its first apply, so that apply changes nothing about them.

## Restore the final dump

The dump is a `pg_dump` archive that Scaleway exports from a backup. Download it with a key the boot-diag bucket admits: the operator key, or the console at Object Storage → `<slug>-boot-diag` → `dumps/`. Then open the database ([Open the database](#open-the-database)) and restore it as the admin role:

```bash
pg_restore --no-owner --no-privileges --dbname "<admin connection string>" <file>
```

A dump restored into a setup again reads its encrypted fields only with the kept `data-encryption-key` and `pii-hash-secret`. Delete the accounts deleted after the dump as in [Restore a backup](#restore-a-backup).

## Clean slate

To leave nothing of a torn-down environment, delete in the console what the teardown kept:

1. Object Storage: the two upload buckets, the boot-diag bucket and `<slug>-pulumi-state`, emptied first. Bucket names stay reserved for several hours.
2. Secret Manager, the environment's project: `data-encryption-key` and `pii-hash-secret` in `/runtime/`. With them goes every encrypted field of the final dump.
3. The `SCW_DEFAULT_PROJECT_ID` line of `infra/.env.<mode>`, and the project if nothing else lives in it.
4. Revoke the Owner API key you pasted.

The next `pnpm infra --mode <mode>` then sets the environment up from nothing.
