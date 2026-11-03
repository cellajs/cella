# infra/tasks

The deploy's steps and the operator tasks. The sequencers keep their live effects as functions on a plan, so unit tests assert step order and every guard.

- **Deploy steps**: [main-job.ts](./main-job.ts) runs [deploy.ts](./deploy.ts), and [deploy-run.ts](./deploy-run.ts) runs the steps in order on the table `deploy-env.ts` builds: `identity-plan`, `ensure-state-bucket`, `install-pulumi-providers`, `sync-rollout-config`, `forget-retired-resources`, `preflight-privileged`, `compose-env` (each machine's env file), `build-release`, `geoip-refresh`, the waved rollout, `clear-machine-links` and `smoke`.
- **Build**: `build-release` makes the builder machine, from `build-images` (the image bake into archives) and `frontend-build-env`, then uploads the frontend files from their archive with `frontend-assets`.
- **Rollout**: `deploy-rollout` runs the two waves through `rollout-plans`, `rollout` and `rollout-runtime`; `cutover` moves a pool, and `wait-for-version` waits for a service to serve the release.
- **Apply and operator tasks**: `ensure-database`, `ensure-secrets`, `seed-operator-secrets`, `passphrase-custody`, `verify-after-apply`, `repair-certs`, `record-rotation`, `manage-runtime-secrets` and `reset-database`.
- **Identity tasks**, written at an Owner moment: `declared-policies`, `uploads-key`, `setup-ci-key`, `setup-operators`, `setup-observer-app`, `provision-managed-key`.
- **Pull request check**: `privileged-check` renders the base and the head with `privileged-footprint`.
- **Status**: `status`, the report behind `pnpm infra status`.
- **Retired-model migrations**: `admit-operator-buckets`, `move-secret-paths` (each secret's copies into one container of the runtime folder).

`args.ts` holds the flag helpers the tasks share.

## Failing a task

A task that [deploy-run.ts](./deploy-run.ts) runs in-process reports failure by throwing, never through `process.exit` or `process.exitCode`: the deploy stops only on a throw. A task whose exit code means something to a standalone caller (exit 2, blocked: the identity check for identities that differ, the preflight for a pending privileged change, the env composition for a missing required secret) throws `ExitCodeError` ([lib/utils/errors.ts](../lib/utils/errors.ts)), and `runIfMain` exits with its code.
