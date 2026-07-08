## Stack Control State

`control-store.ts` stores mutable rollout state in the Pulumi state bucket at
`s3://<slug>-pulumi-state/control/<stack>.json`. The object is plaintext and
contains per-service generation pointers, image SHAs, bootstrap markers, and
writer metadata.

The Pulumi program reads this object at plan time so `pulumi up` converges to
the live rollout truth. The deploy orchestrator writes it around cutover.

Scaleway Object Storage conditional writes (`If-Match` and `If-None-Match`) back
the optimistic concurrency path and the create-if-absent stack lock.
