# infra/lib/stack

The stack's state beside Pulumi's own, and the CLI's edits to Pulumi's.

| Group | Files |
| --- | --- |
| Control and lock | [control-store.ts](./control-store.ts): the control object, which generation each service runs, and the stack lock beside it; [stack-lease.ts](./stack-lease.ts): the lock as a lease its holder renews, so a dead run frees the stack |
| Plans | [plan-basis.ts](./plan-basis.ts): what a plan was made on; [retired-state.ts](./retired-state.ts): resources an apply or a deploy takes out of the state and leaves live; [privileged-footprint.ts](./privileged-footprint.ts) and [keyless-render.ts](./keyless-render.ts): what the pull request check renders |
| Checkpoint | [pending-operations.ts](./pending-operations.ts): what an interrupted Pulumi run left; [pulumi-passphrase.ts](./pulumi-passphrase.ts): the passphrase and its check against the stack's salt |
| Running Pulumi | [pulumi-driver.ts](./pulumi-driver.ts), [pulumi-up.ts](./pulumi-up.ts), [run-pulumi.ts](./run-pulumi.ts), [store-outputs.ts](./store-outputs.ts), [operator-secret-imports.ts](./operator-secret-imports.ts): the values a teardown kept, adopted by the first `up` |
| Which stack | [bootstrap-stack-state.ts](./bootstrap-stack-state.ts), [project-per-mode.ts](./project-per-mode.ts), [stack-context.ts](./stack-context.ts) |
