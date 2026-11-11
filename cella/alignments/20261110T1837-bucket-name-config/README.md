---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: privateBucket, s3.publicBucket
---

# Config bucket names end in Name

`appConfig.s3.publicBucket` and `appConfig.s3.privateBucket` are `publicBucketName` and `privateBucketName`, in
`S3ConfigInput` and in the infra `EngineConfig`. The attachment column `publicBucket`, a boolean, and `bucketName` keep
their names. Every deployed environment runs `pnpm infra apply` once before its next deploy.

## What & why

The two config keys hold bucket names, while the `publicBucket` of an attachment or an upload template is a boolean that
picks the bucket. One word held a name and a flag. The config keys now say they hold a name, like the attachment's
`bucketName`.

## Blast radius

Every app: typecheck names each read and each mode config that sets the keys. A `config.default.ts` that sets them inside
its `as S3ConfigInput` cast escapes it and falls back to `<slug>-public`. The engine's description of the app changes,
so a deploy refuses until an apply.

## Run

No script: manual.

## Manual steps

1. Under `s3` in each `shared/config/config.*.ts` that sets them, `config.default.ts` included, rename `publicBucket` to `publicBucketName` and `privateBucket` to `privateBucketName`.
2. Replace `appConfig.s3.publicBucket` and `appConfig.s3.privateBucket` in app code, scripts and `infra/` with the new keys.
3. Per deployed environment: `pnpm infra apply --mode <env>` (operator key), which publishes the description with the new keys.

## Verify

```sh
pnpm check
pnpm --filter infra exec vitest run
```
