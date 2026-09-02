## Stack Control State

`control-store.ts` stores mutable rollout state in the Pulumi state bucket at `s3://<slug>-pulumi-state/control/<stack>.json`: a plaintext object with per-service generation pointers, image SHAs, bootstrap markers, and writer metadata.

The Pulumi program reads it at plan time so `pulumi up` converges to the live rollout truth; the deploy orchestrator writes it around cutover.

Scaleway Object Storage conditional writes (`If-Match`, `If-None-Match`) back the optimistic concurrency path and the create-if-absent stack lock.
