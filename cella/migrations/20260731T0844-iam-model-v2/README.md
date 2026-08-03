# IAM model v2: per-mode/per-service principals, per-deploy keys, S3 key retirement

## What & why

The infra engine's credential model was rebuilt (cella `refactor/iam-rewrite`, P1–P4). IAM
principals are now per app×mode (`<slug>-<mode>-ci-deploy`, `<slug>-<mode>-vm-<service>`,
`<slug>-<mode>-admin`, `<slug>-<mode>-boot`) inside one IAM group; the keyless `<slug>-operator`
app is replaced by an admin app with a real key; runtime secrets move to per-service Secret
Manager folders guarded by resource-level IAM conditions; CI mints fresh service keys every
deploy (conditioned `IAMApplicationManager` — it still cannot write IAM otherwise); VMs get
their key via a single-access handoff bundle (tamper alarm). The `s3` managed key and the
`s3AccessKeyId` / `s3AccessKeySecret` runtime secrets are **removed**: the backend signs S3
requests with its own service key, exported by the boot runner as
`S3_ACCESS_KEY_ID`/`S3_ACCESS_KEY_SECRET` (env var names unchanged — backend code needs no edit).

## Blast radius

Infra-only; NOT sync-breaking, no `clientCacheVersion` bump, no database change. Every app
with a bootstrapped Scaleway stack is affected operationally: after pulling, existing stacks
keep deploying on the legacy model (name fallbacks are built in) but should migrate promptly.
Apps that customized `infra/config/managed-keys.config.ts`, `runtime-secrets.config.ts`, or
`services.config.ts` merge those files by hand: the s3 entries are gone, and the backend
service entry gained `s3Access: true`. Apps that never enabled the s3 managed key and never
customized infra are unaffected until they choose to migrate.

## Run

No script — manual (operational migration, not a codemod).

## Manual steps

1. Pull the sync; resolve `infra/config/*.config.ts` conflicts (drop s3 entries, keep
   `s3Access: true` on the backend service).
2. Per environment (staging first): `pnpm infra` → **Manage keys & secrets** →
   **Migrate IAM model** → *Migrate to v2* (needs a fresh bootstrap key from the console).
3. Commit the `infra/Pulumi.<mode>.yaml` change (`infra:iamModel: v2`).
4. Run **Stack setup → Apply infra change** with the bootstrap key (creates the per-service
   IAM policies + moves secret folders — CI cannot write IAM).
5. Deploy (CI or local). The first v2 deploy re-rolls all VMs onto the handoff flow.
6. After the deploy is verified green: **Migrate IAM model** → *Clean up legacy principals*.
7. Revoke the bootstrap key.

## Verify

- `pnpm --filter infra test` and `pnpm check` pass after the merge.
- The deploy's "Verify VM IAM grants" step passes (per-app sets + exact path conditions).
- Uploads still work (backend now signs with its service key): upload an attachment and open
  a presigned URL.
- `pnpm --filter infra status` shows the admin app; the Scaleway console shows the
  `<slug>-<mode>` group containing every app.
