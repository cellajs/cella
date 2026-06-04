# Destroy & rebuild the infrastructure

A manual, step-by-step procedure for tearing down the **entire** Pulumi stack and
rebuilding it from scratch — with an optional DB snapshot and upload backup kept
outside the blast radius so data can be reloaded into the fresh stack.

This is intentionally **not** a script. A full teardown is rare, irreversible, and
benefits from a human reading each step's output before continuing. Run the
commands by hand, in order, and stop at each checkpoint.

> Current values (production): slug `rakapp`, stack `organization/infra/production`,
> region `nl-ams`. Adjust if you run this against a different stack.

## Why you can't just `pulumi destroy`

Four constraints in the infra code force the ordering below:

1. **`protect: isProduction`** on the DB instance, all four buckets, and the
   deploy-tags bucket — `pulumi destroy` refuses protected resources until they
   are unprotected.
2. **`forceDestroy: !isProduction`** — in production, buckets that still contain
   objects cannot be deleted. They must be emptied first.
3. **The CI key is read-only** on DB / VPC / Private Network. Destroy must run
   with a **bootstrap key** (IAMManager + delete permissions), not the CI key.
4. **A DB snapshot does not include S3 uploads.** The `rakapp-public` /
   `rakapp-private` buckets hold user files; back them up separately if you want
   to keep them.

---

## Step 0 — Environment (one-time, this shell)

Everything talks to the S3 state backend, so credentials must be in the
environment. Use the **bootstrap key**, not the CI key.

```bash
cd infra
export PULUMI_CONFIG_PASSPHRASE='<passphrase>'
export AWS_ACCESS_KEY_ID='<bootstrap-access>'
export AWS_SECRET_ACCESS_KEY='<bootstrap-secret>'
export SCW_ACCESS_KEY="$AWS_ACCESS_KEY_ID"
export SCW_SECRET_KEY="$AWS_SECRET_ACCESS_KEY"
export SCW_DEFAULT_PROJECT_ID='e2e322db-51db-4141-8b2b-1602966a9ca0'
export APP_MODE=production
```

> Type secrets directly into the terminal. Do not paste them into chat tools,
> commit them, or echo them into files.

## Step 1 — Log into the state backend (read-only)

```bash
pulumi login "s3://rakapp-pulumi-state?endpoint=s3.nl-ams.scw.cloud&region=nl-ams"
pulumi stack select organization/infra/production
```

## Step 2 — Inventory everything BEFORE touching it

```bash
pulumi stack --show-urns     # full resource inventory + URNs
pulumi stack output          # endpoints, bucket names, DB info
```

**Checkpoint:** read the inventory. Confirm which resources are protected and
which hold data. Nothing has changed yet.

## Step 3 — Snapshot the database (safety net, server-side)

Take a native Scaleway RDB snapshot first. It runs server-side, needs no network
reachability, and survives the destroy (set a 30-day expiry).

```bash
# Instance id — from `pulumi stack output` or the URN list in Step 2.
INSTANCE_ID=<db-instance-id>

scw rdb instance snapshot create \
  instance-id="$INSTANCE_ID" \
  name="rakapp-predestroy-$(date +%Y%m%d)" \
  expires-at="$(date -u -v+30d +%Y-%m-%dT%H:%M:%SZ)" \
  region=nl-ams
```

If you don't have the `scw` CLI, the same can be done via the RDB REST API
(`POST /rdb/v1/regions/nl-ams/snapshots`) with `X-Auth-Token: $SCW_SECRET_KEY`.

> A native snapshot restores into a **new, unmanaged** instance. To re-adopt it
> into Pulumi you'd need `pulumi import`. For a clean reload into the rebuilt
> stack, prefer the logical dump in Step 4.

## Step 4 — Optional: portable dump + upload backup

A `pg_dump` restores cleanly into the freshly-bootstrapped database, and an
`aws s3 sync` preserves user uploads the DB snapshot does not cover.

Create a standalone backup bucket (outside Pulumi, self-expiring):

```bash
ENDPOINT=https://s3.nl-ams.scw.cloud
aws --endpoint-url "$ENDPOINT" s3 mb s3://rakapp-snapshots
```

Dump the database. The direct DSN is a stack output:

```bash
DATABASE_URL=$(pulumi stack output dbConnectionStringDirect --show-secrets)
pg_dump -Fc "$DATABASE_URL" \
  | aws --endpoint-url "$ENDPOINT" s3 cp - "s3://rakapp-snapshots/db/rakapp-$(date +%Y%m%d).dump"
```

> The private DB endpoint is only reachable from inside the VPC. If `pg_dump`
> can't connect from your machine, either run it from a VM in the network over
> SSH, or temporarily enable a public endpoint:
> `pulumi config set infra:dbPublicEndpoint true` and
> `pulumi config set infra:dbPublicAcl <your-ip>/32`, run `pulumi up`, take the
> dump, then unset both and `pulumi up` again (or just proceed to destroy).

Back up uploads (skip if you accept losing them):

```bash
aws --endpoint-url "$ENDPOINT" s3 sync s3://rakapp-public  s3://rakapp-snapshots/uploads/public/
aws --endpoint-url "$ENDPOINT" s3 sync s3://rakapp-private s3://rakapp-snapshots/uploads/private/
```

**Checkpoint:** verify the dump and uploads exist in `rakapp-snapshots` before
destroying anything.

```bash
aws --endpoint-url "$ENDPOINT" s3 ls --recursive s3://rakapp-snapshots/
```

## Step 5 — Empty the production buckets

Production buckets have `forceDestroy` off, so they must be emptied before
`pulumi destroy` can remove them. Do **not** empty `rakapp-pulumi-state` (holds
the state you're operating on) or `rakapp-snapshots` (your backup).

```bash
ENDPOINT=https://s3.nl-ams.scw.cloud
for b in rakapp-frontend rakapp-public rakapp-private rakapp-deploy-tags; do
  aws --endpoint-url "$ENDPOINT" s3 rm "s3://$b" --recursive
done
```

## Step 6 — Unprotect, preview, destroy

```bash
pulumi state unprotect --all --yes     # clears protect: isProduction
pulumi preview --diff                   # REVIEW the full deletion plan first
pulumi destroy                          # interactive — review, then approve
```

**Checkpoint:** read the `preview --diff` output in full before approving
`destroy`. This is the point of no return.

## Step 7 — Final cleanup (optional)

- Delete leftover registry images if the namespace delete was blocked.
- Decide on the state bucket and stack file:
  - **Keep** `rakapp-pulumi-state` and `Pulumi.production.yaml` → re-bootstrap
    reuses them (faster, no name-reservation wait).
  - **Wipe** for a truly clean slate → delete the bucket and
    `rm infra/Pulumi.production.yaml`. Note: Scaleway reserves a deleted bucket
    name for several hours, so reusing the same slug immediately may fail.
- Revoke the bootstrap key in the Scaleway console (IAM → API keys).

## Step 8 — Rebuild

```bash
pnpm --filter infra bootstrap   # fresh provision
```

Then reload data into the new stack:

```bash
ENDPOINT=https://s3.nl-ams.scw.cloud

# Restore the database (admin DSN from the new stack).
DATABASE_URL=$(pulumi stack output dbConnectionStringDirect --show-secrets)
aws --endpoint-url "$ENDPOINT" s3 cp s3://rakapp-snapshots/db/rakapp-<date>.dump - \
  | pg_restore --clean --if-exists -d "$DATABASE_URL"

# Restore uploads into the new buckets.
aws --endpoint-url "$ENDPOINT" s3 sync s3://rakapp-snapshots/uploads/public/  s3://rakapp-public
aws --endpoint-url "$ENDPOINT" s3 sync s3://rakapp-snapshots/uploads/private/ s3://rakapp-private
```

Finally, run migrations/seed as needed (see the main
[README](./README.md#mode-b--routine-deploys-ci)) and verify the app comes up.

## Step 9 — Tidy up

Once the rebuilt stack is verified healthy, delete the backup bucket (or let its
lifecycle expiry remove it) and confirm the pre-destroy RDB snapshot is no longer
needed:

```bash
aws --endpoint-url https://s3.nl-ams.scw.cloud s3 rb s3://rakapp-snapshots --force
```
