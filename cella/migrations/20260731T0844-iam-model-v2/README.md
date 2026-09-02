# IAM model v2: per-mode/per-service principals, per-deploy keys, S3 key retirement

> **2026-08 update:** the legacy (v1) code paths, the `infra:iamModel` flag, and the
> **Migrate IAM model** CLI action are removed (v2 only). A stack still on v1 must run the steps
> below from a checkout before cella's `refactor/iam-v2-only` change, then sync past it.

## What & why

Credential model rebuilt (cella `refactor/iam-rewrite`, P1-P4): IAM principals per app x mode
(`<slug>-<mode>-ci-deploy`, `<slug>-<mode>-vm-<service>`, `<slug>-<mode>-admin`,
`<slug>-<mode>-boot`) in one IAM group; the keyless `<slug>-operator` app becomes an admin app with
a real key; per-service Secret Manager folders with resource-level IAM conditions; CI mints fresh
service keys every deploy (conditioned `IAMApplicationManager`); VMs get their key via a
single-access handoff bundle (tamper alarm). The `s3` managed key and `s3AccessKeyId` /
`s3AccessKeySecret` runtime secrets are removed: the backend signs S3 with its own service key,
exported by the boot runner as `S3_ACCESS_KEY_ID`/`S3_ACCESS_KEY_SECRET` (names unchanged, no
backend edit).

## Blast radius

Infra-only; not sync-breaking, no `clientCacheVersion` bump, no database change. Every bootstrapped
Scaleway stack is affected operationally: existing stacks keep deploying on the legacy model (name
fallbacks) but should migrate promptly. Customized `infra/config/managed-keys.config.ts`,
`runtime-secrets.config.ts`, or `services.config.ts` merge by hand (s3 entries gone, backend
service gains `s3Access: true`); apps that never customized infra are unaffected until they migrate.

## Run

No script, manual (operational migration).

## Manual steps

1. Pull the sync; resolve `infra/config/*.config.ts` conflicts (drop s3 entries, keep
   `s3Access: true` on the backend service).
2. Per environment (staging first): `pnpm infra` -> **Manage keys & secrets** -> **Migrate IAM
   model** -> *Migrate to v2* (needs a fresh console bootstrap key).
3. Commit the `infra/Pulumi.<mode>.yaml` change (`infra:iamModel: v2`).
4. Run **Stack setup -> Apply infra change** with the bootstrap key (per-service IAM policies +
   secret folder moves; CI cannot write IAM).
5. Deploy (CI or local); the first v2 deploy re-rolls all VMs onto the handoff flow.
6. After the deploy is verified green: **Migrate IAM model** -> *Clean up legacy principals*.
7. Revoke the bootstrap key.

## Verify

- `pnpm --filter infra test`, `pnpm check`.
- Deploy step "Verify VM IAM grants" passes (per-app sets + exact path conditions).
- Upload an attachment and open a presigned URL.
- `pnpm --filter infra status` shows the admin app; the Scaleway console shows the `<slug>-<mode>`
  group containing every app.
