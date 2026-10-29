---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: engineSecretPath, deployFolderPath, handoffFolderPath, secretManagerPath, bootKeyCondition, legacySharedSecretPath, serviceKeyCondition, principalSecretCondition, secretCopyContainers, runtimeSecretPath
---

# Secret Manager paths start at the project's root

Every environment's secrets move from `/<slug>-<mode>/…` to `/…` (`/backend/`, `/deploy/`, `/handoff/`, `/engine/`), and the
machine policies and the deploy key's policy name the new folders. Each environment runs an apply, Update identities and an
apply again; until then its deploys end blocked.

## What & why

Every environment has a Scaleway project of its own, so the `/<slug>-<mode>` prefix only repeated the project.
`lib/scaleway/secret-paths.ts` drops it: `DEPLOY_FOLDER`, `ENGINE_FOLDER`, `HANDOFF_FOLDER` and `BOOT_KEY_CONDITION` are
constants, and `secretCopies`, `serviceKeyCondition` and `principalSecretCondition` take no slug or mode. Unlocking the operator
key moves a stack's secrets in place (`tasks/move-secret-paths.ts`): ids and versions stay, so the main job's references, cloud-init
and every machine's manifest keep working.

## Blast radius

Every app with a deployed stack. No database, cache or wire change. App code that builds a secret path by hand drops the prefix.
After the move, a checkout or release from before this change reads empty folders: upgrade every operator machine first.

## Run

No script: manual.

## Manual steps

1. Per environment, back to back and with no release started in between: `pnpm infra apply --mode <env>` (operator key). Unlocking the key moves every secret out of `/<slug>-<mode>/`, one line each; the apply then stops at the identity check, as the policies still name the old folders.
2. `pnpm infra identity --mode <env>` with an Owner API key that expires within a day: it rewrites each machine policy and the deploy key's policy to the new folders. Revoke the key after. A machine that rebooted between step 1 and this step could not hydrate: reboot it again now.
3. `pnpm infra apply --mode <env>` (operator key): the plan changes the main job's `DEPLOY_FOLDER`, and the apply starts a blocked target again. A private repository's deploy started between step 1 and this step fails at its fetch: `pnpm infra start-deploy --mode <env>`.
4. App code or scripts that call the functions in `grep` drop their slug and mode arguments (the typecheck names them); a hand-written `/${slug}-${mode}/` path becomes the folder alone.

## Verify

```sh
pnpm infra identity --mode <env>   # The identities of <env> are as declared.
pnpm infra status --mode <env>     # secrets.required and inventory.mainJob are ok
pnpm --filter infra exec vitest run tasks/move-secret-paths.test.ts tests/unit/secret-scope.test.ts
pnpm check
```
