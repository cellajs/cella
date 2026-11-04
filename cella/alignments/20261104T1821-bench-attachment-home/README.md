---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# The bench attachment home is typed by the hierarchy's id columns

`benchAttachmentHome` in the app-owned `bench/src/seeds/attachment-home.ts` returns `BenchAttachmentHome` from
`./ids`, and the attachment seed checks what it returns against that type. raak: the stub's return annotation
`Record<string, string>` becomes `BenchAttachmentHome`, imported beside `projectId`. projectcampus compiles
unchanged. `bench/src/tests/attachment-home.test.ts` is gone.

## What & why

The stub typed an attachment's home ids as `Record<string, string>`, so a misspelled or missing column compiled and
a runtime test caught the missing one. `BenchAttachmentHome` maps each ancestor below the organization to its id
column: required for a strict ancestor, optional for a nullable one. Its channel set is spelled
`Exclude<AncestorChannelType<'attachment'>, 'organization'>`, which is `HomeChannelType<'attachment'>` once that
type is in `shared/types.ts`.

## Blast radius

Apps whose attachments live below the organization in a strict ancestor: their `Record<string, string>` stub fails
the seed's check. An app whose ancestors are all nullable compiles. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In `bench/src/seeds/attachment-home.ts`, replace the return annotation `Record<string, string>` with `BenchAttachmentHome` and import it from `./ids`; raak's import line already takes `projectId` from there.
2. An app whose ancestors are all nullable, such as projectcampus, makes the same edit so a misspelled column fails the typecheck.
3. Drop an app copy of `bench/src/tests/attachment-home.test.ts` if one is left.

## Verify

```sh
pnpm check
pnpm --filter bench db:seed
```
