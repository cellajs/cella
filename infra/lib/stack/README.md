# infra/lib/stack

The stack's state beside Pulumi's own, and the CLI's edits to Pulumi's.

| Group | Files |
| --- | --- |
| Records and lease | [control-store.ts](./control-store.ts): the objects under `control/<mode>/` of the boot-diag bucket, the lease and the rotations, and their conditional writes (the live record is [lib/deploy/live-record.ts](../deploy/live-record.ts), the applied engine [lib/deploy/applied-engine.ts](../deploy/applied-engine.ts)); [stack-lease.ts](./stack-lease.ts): the lease its holder renews, so a dead run frees the environment |
| Plans | [retired-state.ts](./retired-state.ts): resources an apply takes out of the state and leaves live; [privileged-footprint.ts](./privileged-footprint.ts) and [keyless-render.ts](./keyless-render.ts): what the pull request check renders |
| Checkpoint | [pending-operations.ts](./pending-operations.ts): the checkpoint's key, and what an interrupted Pulumi run left; [pulumi-passphrase.ts](./pulumi-passphrase.ts): the passphrase and its check against the stack's salt |
| Running Pulumi | [pulumi-up.ts](./pulumi-up.ts), [store-outputs.ts](./store-outputs.ts), [kept-resources.ts](./kept-resources.ts): what a teardown keeps, and the imports that adopt it at the next setup |
| Which stack | [bootstrap-stack-state.ts](./bootstrap-stack-state.ts), [project-per-mode.ts](./project-per-mode.ts), [stack-context.ts](./stack-context.ts) |
