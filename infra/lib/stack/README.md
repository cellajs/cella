## Stack Control State

`control-store.ts` stores mutable rollout state in the Pulumi state bucket at `s3://<slug>-pulumi-state/control/<stack>.json`: a plaintext object with per-service generation pointers, image SHAs, bootstrap markers, and writer metadata.

The Pulumi program reads it at plan time so `pulumi up` converges to the live rollout truth; the deploy orchestrator writes it around cutover.

Scaleway Object Storage conditional writes (`If-Match`, `If-None-Match`) back the optimistic concurrency path and the create-if-absent stack lock.

## Interrupted operations

A Pulumi run killed mid-operation leaves a `pending_operations` entry in the stack checkpoint (`.pulumi/stacks/<project>/<stack>.json` in the same bucket), and every later run warns about it. `pending-operations.ts` reads the entries straight from that object, so `infra status` reports them without a login or the passphrase.

The Unlock action clears only pending creates, and only when nothing else is pending: it saves `pulumi stack export` to `infra/.state-backups/`, then runs `pulumi stack import` on the export without the creates. Pulumi's import drops every pending entry (checked on Pulumi 3.265), so an interrupted update or delete would vanish unread; those go to `pulumi refresh`, which reads each resource first. `pulumi refresh --clear-pending-creates` clears creates too, but it rewrites every resource from its live read and the next CI deploy diffs against that, while the export and import change nothing but the records. The LB pools' `serverIps`, which the cutover sets, carry `ignoreChanges`, so a refresh recording them is harmless.
