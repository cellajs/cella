---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: computeGenerationMetadata, serviceGenerationIps, sync-rollout-config, forget-retired-resources, preflight-privileged, deploy-rollout, rollout-runtime, cutover, select-generations, gen-id, readControlState, controlKey, ServiceRollout, privateIp, pollForVersion, BOOT_IMAGE_NAME, infra/boot, lb-internal, computeDeferred, bootstrap:legacyServers
---

# Machines out of Pulumi, traffic by health

Per environment, once its target carries this change: **Update identities**, an apply, `pnpm infra start-deploy`, then a second apply. The deploy now makes and deletes each role's machine through the Instance API on one of two reserved addresses, the pools list both for good and an agent on each machine answers their health checks, and the deploy key loses the load balancer, the reserved addresses and the Pulumi state. An app that customized `infra/config/env-suppliers.config.ts` rewrites each supplier as a function of `{ naming, region, mode, serviceUrl }`; one that imported the removed modules fails typecheck.

## What & why

A deploy no longer runs Pulumi: it reads `control/<mode>/live.json` in the boot-diag bucket, boots each role on its idle slot, waits until the pools see the new address running, then writes `drain` into the old machine's manifest and deletes it. `infra-agent` (formerly the boot runner, `infra/agent/`) answers `/health/<service>` on port `9000 + index`. The lease moves to `control/<mode>/lock.json`, rotations beside it. Gone: generations, waves, the cutover, the preflight, identity checks at deploy start, `@{x.privateIp}` bindings.

## Blast radius

Every app with a deployed environment: one Owner moment, two applies and a deploy each. No database, cache or lens change. The first deploy deletes each program machine once its new one serves; the pools still check the app path then, so a few seconds of failures are possible.

## Run

No script: manual. The apply carries the move itself (`infra/tasks/retire-program-machines.ts`).

## Manual steps

1. Upgrade every operator checkout first: an older one would plan the machines back into the state.
2. Let the environment's target move to a commit with this change (staging: the merge; production: the release tag). Its first run fails at "Switch machines" with "an apply reserves it", and the program's machines keep serving.
3. `pnpm infra identity --mode <env>` with an Owner API key: `<slug>-<mode>-ci-deploy-policy` gets `LoadBalancersReadOnly` and `IPAMReadOnly` and loses its organization rule.
4. `pnpm infra apply --mode <env>`: before its plan it sets `bootstrap:legacyServers` to the pools' current servers, names each program machine in the live record on slot b, copies the rotations beside it and takes the machines out of the state, live. Its `up` reserves `<slug>-<mode>-<role>-a` and `-b`, lists them in the pools beside the legacy addresses, makes the role security groups, drops the deploy key from the state bucket policy and the passphrase from the main job.
5. `pnpm infra start-deploy --mode <env>`: each role boots on slot a beside its program machine, then drains and deletes that one.
6. `pnpm infra apply --mode <env>` again: it deletes any program machine left, releases their addresses and flexible IPs, removes `bootstrap:legacyServers`, and the pools then list the reserved addresses alone, checked by the agent.
7. Commit `infra/Pulumi.<env>.yaml` once step 6 removed the key.
8. A half-done move: after step 4 the program's machines serve and the next deploy, by the runner or by hand, does step 5; after step 5 the pools keep dead legacy addresses and the app-path check, which step 6 ends. Between the steps nothing goes down.

## Verify

```sh
pnpm check
pnpm --filter infra exec vitest run
pnpm infra status --mode <env>
pnpm infra runs --mode <env>
```
