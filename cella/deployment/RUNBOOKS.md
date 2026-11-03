# Runbooks

This document collects the procedures for a running deployment: a failed or blocked deploy, a stale lease, GeoIP data, database access, a stopped CDC worker, seeding the admin, resetting or restoring the database, and tearing a stack down.

### TL;DR

Machines take no logins, so every procedure runs through the Infra CLI or the Scaleway console. Resetting the database
is a hard outage, for pre-production or a planned stop. A teardown deletes every resource to stop billing; a clean
slate only resets the stack's tracking.

## Debug a failed deploy

Start with `pnpm infra runs` (`--mode staging` for staging): a failed run shows the step that failed and a failed machine's boot error. A switch that times out waiting for the new machine to serve means its agent never answered 200: almost always a crash at boot, not the load balancer. The new machine was deleted and the old one kept serving; a role that switched before the failure serves the target, and the next run of the same target switches only the rest.

1. **Read the boot accounts first.** `pnpm infra runs --sha <sha>` prints each machine's boot account of that release with the builder's report: the boot phases, the migrate companion's output and a crashed container's output. "No account" means the agent never finished its boot; then the machine's serial console (Scaleway console → Instances → the machine → Console) shows how far it got. A deleted machine's console is gone with it: for a boot that never reports, start the same target with a raised retry counter and read the console while the deploy waits.
2. **Reproduce locally.** Build the image at the release's commit, or `docker load` its archive from `releases/<sha>/images/` of the boot-diag bucket, and `docker run` it with a minimal valid environment: a failing import (`ERR_MODULE_NOT_FOUND`) shows in seconds.
3. **Check the usual causes:**
   - a package the image lacks: `pnpm boot:check` catches one missing from `dependencies`
   - a secret value of several lines ([Runtime secret delivery](../DEPLOYMENT.md#runtime-secret-delivery))
   - an image older than a change to the database or the secrets it expects
   - node-postgres checking the TLS hostname against the IP it dialed
   - a link that ended before the machine fetched it: a 403 at `fetch-env` or `load-images`, when the machine took longer than the link's minutes to boot
   - an instance-type quota too low for a new machine beside the old one
   - "an apply makes it": the deploy found no reserved address, pool or security group it needs, as after an engine change or a new role: run **Review & apply changes**, then the same target

## A blocked deploy

A blocked run made no machine, and the running release stays. `pnpm infra runs` names what it owes:

- **An empty required secret:** store it in **Manage runtime secrets** (`pnpm infra secrets`), which starts the target again. A generated or database value is made by **Review & apply changes** (`pnpm infra apply`), the uploads key by **Update identities**.

The runner never starts a blocked target again.

## A stale lease

A deploy or an operator action that dies holds its lease, `control/<mode>/lock.json` in the boot-diag bucket, until it lapses within minutes, and the next run waits for it. `pnpm infra status` reports it.

1. `pnpm infra` → **Repair stack** → **Unlock stack** (`pnpm infra unlock`) removes an expired lease at once, and a live one only after you confirm. A live lease most likely belongs to a run that is still going: check `pnpm infra runs` first.
2. A deploy that died mid-switch may have left a machine on the idle slot: the next deploy drains and deletes it before it boots there, so nothing is owed for it.
3. Unlock then lists the operations an interrupted apply left in the Pulumi state. When all of them are creates, it offers to drop them and keeps a state export in `infra/.state-backups/` as the rollback. Check the Scaleway console for each resource first: a create that went through left a resource the state does not track.
4. An interrupted update or delete stays: run the `pulumi refresh` that Unlock prints, logged in with the operator key and with the passphrase from the environment's `/engine/` secret folder.

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
3. **Close it again**: a deploy does not, and the next apply's plan would close it unasked. The menu offers the close while the endpoint is open, and `pnpm infra status` warns about it.

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

`pnpm infra` → **Tear down stack** asks you to type `<slug>-<mode>`, then deletes every machine the deploys made and every resource of the stack to stop billing, with your operator key. It then offers to delete the stack's IAM principals, for which it asks for an Owner API key. The app's operator application stays: it serves the other environments. Production resources marked `protect: true` (frontend/private buckets, database) are refused unless protection is lifted in code first. Left in place on purpose: the versioned state bucket and operator secret values. Then drop the environment from `infra/runner.json`, **Replace the runner**, and remove `infra/.env.<mode>`.

> **Clean slate** below is not a teardown: it resets stack tracking to set up a still-running stack again. Live resources stay.

## Clean slate

1. `rm infra/Pulumi.<mode>.yaml`
2. (optional) Scaleway console → Object Storage → delete bucket `<slug>-pulumi-state` (names stay reserved for several hours).
3. (optional) Revoke the Owner API key you pasted, in the Scaleway console.
4. (optional) Delete IAM application `<slug>-<mode>-ci-deploy` and its policy.
5. Re-run: `pnpm infra`
