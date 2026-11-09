# Runbooks

This document collects the procedures for a running deployment, from a failed deploy to tearing a stack down.

### TL;DR

Every procedure runs through the Infra CLI or the Scaleway console, since machines take no logins. Resetting the database
is a hard outage, for pre-production or a planned stop. A teardown deletes everything that runs or costs and keeps what
cannot be made again for the next setup. A clean slate deletes that too.

## Debug a failed deploy

**Deploy now** ends a run that did not deploy with one sentence on whose side the failure is, then the release your users still get. **Deploy logs** (`pnpm infra runs`, adding `--mode staging` for staging) shows the same sentence under a run's header, with the step that failed and a failed machine's boot error. The home's **Last deploy** line says it too. The sentence names one of four sides:

- **Scaleway's side:** its API failed under the deploy, it had no machine of that type in stock, or a machine booted slower than its links lasted. Your code never ran there. **Deploy now** offers a retry, which usually passes. Raise a reached quota in the console at Organization → Quotas.
- **The release's side:** its build failed, a new machine crashed at boot, or the smoke tests failed on it. The sentence names the report to read.
- **Your side:** a value is missing ([A blocked deploy](#a-blocked-deploy)), or the release changes the infrastructure ([Apply needed](#apply-needed)).
- **Not known:** the recorded error, or a new machine that never answered its health check, which is almost always a crash at boot.

A switch that times out waiting for the new machine means its agent never answered 200. That is almost always a crash at boot, not the load balancer.

The deploy deleted the new machine, and the old one kept serving. A role that switched before the failure serves the target. The next run of the same target switches only the rest.

1. **Read the boot accounts first.** `pnpm infra runs --sha <sha>` prints each machine's boot account of that release with the builder's report, a crashed container's output included. "No account" means the agent never finished its boot. The machine's serial console then shows how far it got: Scaleway console → Instances → the machine → Console. A deleted machine's console is gone with it. For a boot that never reports, start the same target with a raised retry counter and read the console while the deploy waits.
2. **Reproduce locally.** Build the image at the release's commit, or `docker load` its archive from `releases/<sha>/images/` in the boot-diag bucket. `docker run` it with a minimal valid environment. A failing import such as `ERR_MODULE_NOT_FOUND` shows in seconds.
3. **Check the usual causes:**
   - a package the image lacks: `pnpm boot:check` catches one missing from `dependencies`
   - a secret value of several lines ([Runtime secret delivery](../DEPLOYMENT.md#runtime-secret-delivery))
   - an image older than a change to the database or the secrets it expects
   - node-postgres checking the TLS hostname against the IP it dialed
   - "an apply makes it": run **Review & apply changes**, then the same target

## A blocked deploy

The running release stays: a blocked run booted no machine of the release. **Deploy now**, **Deploy logs** and the home's **Last deploy** line name the value it waits for. What stores it depends on its kind:

- **An operator value:** **Env vars & secrets** (`pnpm infra secrets`) says above its table which deploy waits for which values, and lists each first as `missing · required`. Pick its row and set it. Storing it starts the target again.
- **A generated or database value:** **Review & apply changes** (`pnpm infra apply`).
- **The uploads key:** **Update identities**.

No scheduled run starts a blocked target again. Storing the value or the apply does.

## Apply needed

A run ends **apply needed** when its target describes the app otherwise than the engine the last apply published ([What needs an apply](./CHANGING_INFRASTRUCTURE.md#what-needs-an-apply)). The running release stays: the run stopped before it read a runtime value or booted a machine of the release. **Deploy logs** names the fields that differ, such as `services.search added`. For a release built without its description, it shows the two hashes.

1. Check out the target's commit, for production its release tag. Run **Review & apply changes** (`pnpm infra apply --mode <env>`). Before it builds, it compares this checkout's description with the waiting release's. When they differ, it names the fields and stops with the command that checks out the release, `git switch --detach <tag>`. From the right checkout it publishes that checkout's engine and starts the target again at its end.
2. "did not start from the engine image an apply publishes" means the run started on a definition older than the applied engine. The apply in step 1 rewrites it.
3. "reports no description" means the target is older than the applied engine, which cannot deploy it. Deploy a newer release, or roll forward.
4. "The image describes … the apply as …" during the apply's build has two causes. The apply's shell overrides a config value such as `APP_ORIGIN`, or the description needs a file git does not track. Unset the override or `git add` the file, then apply again.

**Full status** compares the main job's image with the digest `applied.json` names in its **Main job** check.

## Roll back

No old machine is kept to switch back to: a rollback deploys an earlier release on the same forward path. `pnpm infra` → **Releases & roll back** (`pnpm infra releases`) lists the last ten releases, newest first. Each shows when it merged, how its deploy ended and whether it serves.

1. Pick an earlier release. With your operator key it says whether the release's build is kept for the deploy to reuse, and whether the release describes the app as the applied engine does. One that does not needs an apply from a checkout at that release first ([Apply needed](#apply-needed)). One older than the applied engine cannot be deployed: roll forward then.
2. Confirm, and it deploys the release and follows it as **Deploy now** does.

The environment stays on that release, since a scheduled run never deploys a target again under a retry counter it already ran. Production holds until the next release, staging until its branch moves. After 60 days the target's run records expire, and the next scheduled run deploys the target again. To hold longer, add the line `<mode> <tag>` to `infra/environments`.

A rotation of keys or secrets keeps the rollback: it deploys the live release again and starts the target only when the target has no run yet. To leave a release behind for good, commit a revert and publish the next release.

## A stale lease

A deploy or an operator action that dies holds its lease until it lapses within minutes. The next run waits for it, and `pnpm infra status` reports it.

1. `pnpm infra` → **Repair** → **Unlock** (`pnpm infra unlock`) removes an expired lease at once. It removes a live one only after you confirm. Check `pnpm infra runs` first, since a live lease most likely belongs to a run still going.
2. A deploy that died mid-switch may have left a machine on the idle slot. You owe nothing for it: the next deploy drains and deletes it before it boots there.
3. Unlock then lists the operations an interrupted apply left in the Pulumi state. When all of them are creates, it offers to drop them. It keeps a state export in `infra/.state-backups/` as the rollback. Check the Scaleway console for each resource first. A create that went through left a resource the state does not track.
4. An interrupted update or delete stays. Run the `pulumi refresh` that Unlock prints, logged in with the operator key and the passphrase from the environment's `/engine/` secret folder.
5. An apply may fail to delete a resource the program no longer declares, as its live object is gone already. **Remove from state** (`pnpm infra state-prune`) takes its URN out of the state.

## A page stuck on the apex

A visitor who opens the bare domain sees an old release that loads nothing, while a fresh browser on the same address lands on `www`. Their browser keeps a worker from a deploy that served the apex, and that worker answers every visit from its cache without asking the server.

The apex answers the worker script itself: that script replaces the kept worker on the visitor's next visit and moves the page to `www`. The smoke checks of every deploy fail when the apex stops redirecting or stops answering the script. A visitor still stuck clears the site data of the bare domain.

## GeoIP data

Sign-ins resolve the client IP to a country and network with DB-IP Lite data, under CC BY 4.0. The sessions list and the new sign-in notice show them. The image ships no data, and a refresh needs no release. Each API process downloads the data from the `geoip/` prefix of the public bucket at boot and checks for newer data.

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

While it is open, **Review & apply changes** (`pnpm infra apply`) refuses to run. Close it first: the apply's plan would remove the ACL and keep the endpoint.

## A stopped CDC worker

A stopped CDC worker's replication slot keeps WAL until the database volume fills. When the worker cannot be brought back, [open the database](#open-the-database) and drop the slot:

```sql
SELECT pg_drop_replication_slot('cdc_slot');
```

The worker makes a new slot when it starts again. Every client then refetches once.

## Seed the admin by hand

Fix a wrong admin email in **Env vars & secrets**. Then run a deploy that makes a new backend machine, such as **Rotate secrets**. A machine keeps the env file it booted with. The new machine's boot seeds the admin while the users table is empty.

On staging, **Open DB access** → **Seed database** (`pnpm infra db-seed`) seeds demo data with the admin. It opens the database, seeds and closes it in one go. It never runs on production. Elsewhere, [open the database](#open-the-database). The migrate companion seeds the admin on an empty users table. Build the backend and run it with the printed connection string:

```bash
pnpm --filter backend build
ADMIN_EMAIL=you@example.com DATABASE_ADMIN_URL='<printed connection string>' SERVICE=migrate node backend/dist/main.js
```

## Reset the database

**Reset database** rebuilds the app's logical database from migrations plus the admin seed. **Pre-production only, or with services deliberately quiesced: a hard outage.**

`pnpm infra` → **Reset database** takes a backup, deletes and recreates the logical database, and re-grants both roles. It runs on your operator key. Then reboot the backend machine: [Scaleway console](https://console.scaleway.com/instance/servers) → the machine → **Reboot**. Its boot migrates the empty database and seeds the admin.

Verify that `curl https://<your-app>/api/health?depth=full` reports every component `healthy`. The CDC worker rebuilds its sync books, since a recreated or restored database has no replication slot ([Verify and rebuild](../../cdc/README.md#verify-and-rebuild)).

- **Nothing but you stops this.** Scaleway deletes a database in use, replication slot included.
- **The typed name is the only guard.** You confirm by typing `<database>@<instance>`.
- **Re-granting is mandatory.** After a delete or a restore, the app reports `database_unreachable` until then.
- **A failure after the delete prints the fix.** It names the restore and re-grant commands below.

## Restore a backup

A backup holds the accounts deleted after it was taken. A deletion someone asked for must hold on the restored database too. The live database lists every deleted account, since its `actors` row stays behind. Before restoring, save that list:

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

`pnpm infra` → **Tear down** asks you to type `<slug>-<mode>`. It asks for one key and nothing else: an Owner API key that expires within a day. The one key deletes the resources and the identities, since the Owner key holds every right.

Before it touches anything, it refuses a key the bucket policies do not name. Your user is named once it joins `<app>-operators` and the next **Review & apply changes** runs.

Before the database goes, the teardown writes a **final dump** into the boot-diag bucket under `dumps/<mode>/<time>`. The dump comes from a backup Scaleway makes and keeps a few days. Neither the uploads key nor the observer reads there.

When the dump fails, the teardown destroys nothing of the stack and says what it did before. Stop traffic first: a write the app takes after the dump is lost.

The teardown deletes:

- every machine the deploys and the builder made, with the reserved addresses they held
- the load balancer with its address, and the DNS records
- the private network and the security groups
- the database, the main job and the registry namespace
- every secret container but the keys that protect stored data
- the deploy and uploads applications with their policies and keys
- the `<slug>-<mode>` group

The app's operators and observer stay, since they serve the other environments.

It keeps these, with their contents:

- the two upload buckets
- the boot-diag bucket with the run records and the rotations
- the state bucket
- the `data-encryption-key` and `pii-hash-secret` containers in `/runtime/`

Each kept bucket keeps its policy. Without the two kept keys, the dump's encrypted and hashed fields no longer read. The live record goes with the machines it named. A setup again asks for third-party keys, since they go with the other secrets.

The project id stays in `infra/.env.<mode>`. Commit the deletion of `infra/Pulumi.<mode>.yaml`. A setup again (`pnpm infra --mode <mode>`) runs in the same project. Its first apply changes nothing about what the teardown kept: the setup adopts them before that apply.

A destroy that stops halfway leaves what it had not reached in the state. Tear down again to finish.

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
3. The `SCW_DEFAULT_PROJECT_ID` line of `infra/.env.<mode>`. When nothing else lives in the project, delete it too.
4. Revoke the Owner API key you pasted.

The next `pnpm infra --mode <mode>` then sets the environment up from nothing.
