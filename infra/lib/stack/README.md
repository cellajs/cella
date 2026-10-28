# infra/lib/stack

The stack's state beside Pulumi's own, and the CLI's edits to Pulumi's.

| File | Holds |
| --- | --- |
| [control-store.ts](./control-store.ts) | The control object (`control/<stack>.json` in the state bucket: per-service generation pointers and image SHAs) and the stack lock beside it. The program reads the pointers at plan time; the deploy writes them around a cutover. Conditional writes (`If-Match`, `If-None-Match`) keep both safe from a concurrent writer. |
| [stack-lease.ts](./stack-lease.ts) | The stack lock as a lease its holder renews, so a dead run frees the stack within minutes. |
| [pending-operations.ts](./pending-operations.ts) | The operations an interrupted Pulumi run left in the checkpoint, read without a login or the passphrase, and the Unlock action's clear of pending creates. |
| [retired-state.ts](./retired-state.ts) | Resources the program no longer declares that an apply takes out of the state and leaves live. |
| [plan-basis.ts](./plan-basis.ts) | What a plan was made on, so an apply sees the state move before it applies. |
| [privileged-footprint.ts](./privileged-footprint.ts) | What an environment's code owes an apply or an Owner moment, for the pull request check. |
