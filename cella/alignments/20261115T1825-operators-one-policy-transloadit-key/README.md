---
breaking: false
clientCacheBump: false
grep: OperatorsResult, operator-policy
---

# Operators hold one policy, and Transloadit gets a write-only key

After the upgrade, run `pnpm infra operators` once per app: it moves the operators to the group's policy and deletes the operator application's own. An environment that stores a Transloadit auth key then runs `pnpm infra identities` and `pnpm infra apply`, and pastes the key shown into Transloadit's Template Credentials.

## What & why

`setupOperators` writes one policy, `<app>-operators-policy` on the group, makes `<app>-operator` a member and deletes `<app>-operator-policy`. Update identities makes `<app>-transloadit` where the runtime folder holds `transloadit-key`: object writes only, admitted by the upload buckets' `TransloaditStore` statement. Until now Transloadit needed a key of another identity, such as the uploads key, which reads stored files and which Rotate keys replaces. `OperatorsResult` has new fields, and `appPrincipalNames` gains `transloadit`.

## Blast radius

Every app deployed with the infra CLI. Nothing stops working without the steps: the operators keep both policies, and Full status reports `<app>-operator-policy` beside the declared one. An environment without a Transloadit auth key gets no application. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm infra operators --mode <env>` once per app, with an Owner API key.
2. Per environment that stores a Transloadit auth key, run `pnpm infra identities --mode <env>` with an Owner API key and keep the key it shows.
3. Run `pnpm infra apply --mode <env>`, so the upload buckets admit that key.
4. In Transloadit, set the key and secret of the two Template Credentials named after the upload buckets, then upload an avatar and an attachment.
5. Delete the key Transloadit held before when it was made by hand; the uploads key stays.

## Verify

```sh
pnpm infra status --mode <env>
pnpm check
```
