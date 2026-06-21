# Boot agent containerization (Variant B)

Status: proposed (spike pending). Owner discussion 2026-06-21.

## Problem
The boot agent's *logic* ([infra/agent/src/boot.ts](../infra/agent/src/boot.ts)) is clean, testable TS
that developers control with confidence — that is a deliberate, valued goal and should stay. The
*heavy* primitives are how the agent is **packaged and distributed**:

1. **SEA build** ([infra/agent/build.ts](../infra/agent/build.ts)) — compiles boot.ts into a Node
   Single Executable Application: bundle→CJS, generate SEA blob, fetch a Linux node binary, `postject`
   inject into the ELF (incl. filtering benign objcopy warnings). Fiddliest code in the agent; pure
   packaging, zero product logic.
2. **Packer bake** ([infra/agent/compute-docker.pkr.hcl](../infra/agent/compute-docker.pkr.hcl)) — bakes a
   Scaleway VM image = Ubuntu + Docker + the baked SEA binary (~1h image creation, smoke tests, stable
   image-name resolution). Drives `image:build`, `wait-for-images`, image-id plumbing.

`boot.ts` itself (8 steps: wait-private-net, write app files, docker login, hydrate runtime secrets,
pull image, run release/migrate, start service, upload boot diagnostics) is the good part.

## Decision: Variant B — agent as a container, pulled and run at boot (pull model)
Build `boot.ts` into a normal **Docker image** (a Dockerfile, like every other service) instead of a SEA.
cloud-init runs it at boot:

```
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /opt/app:/opt/app \
  -v /etc/runtime-secrets:/etc/runtime-secrets \
  <registry>/cella-boot-agent:<sha> --plan /opt/app/boot-plan.json
```

The agent container does host-level `docker compose up` via the mounted docker socket
(docker-out-of-docker) — same root-equivalent privilege the SEA already runs with via cloud-init.

### Why B over the alternatives
- vs **today (SEA+Packer)**: deletes `agent/build.ts` (whole SEA pipeline) and the agent half of the
  Packer bake. VM image becomes a stock Scaleway Docker marketplace image (or a near-trivial bake).
- vs **Variant A (Serverless Job orchestrates the VM remotely, push model)**: A is elegant for
  centralizing logic but (1) reintroduces an inbound execution channel (SSH/listener) into the VM —
  contradicting the deliberate no-SSH, pull-only posture ([infra/tests/unit/compute.test.ts](../infra/tests/unit/compute.test.ts)
  asserts no port 22), and (2) breaks VM self-healing on reboot (needs docker `restart: always` +
  re-trigger). B keeps **no inbound** and **self-healing**.
- Improves the testability goal: a container runs the same TS, testable with `docker run` locally;
  drops the SEA voodoo (least-confidence code in the repo).

### Costs / wrinkles of B
- One extra image pull at boot (the agent image) + a network dependency at boot. Minor; Scaleway
  marketplace already offers Docker-preinstalled images so Docker need not be baked.
- The agent container needs the docker socket + `/opt/app` mounts and the `vm-reader` key (registry
  pull + Secret Manager read) — already present in cloud-init today.

## What gets deleted / changed (spike scope)
- DELETE `infra/agent/build.ts` (SEA pipeline) + `sea-entry.ts` + `.sea-cache`; the `agent:build`,
  `image:*` SEA bits.
- REPLACE most of `compute-docker.pkr.hcl` with either a stock marketplace Docker image or a tiny bake
  (Docker only). Likely deletes `wait-for-images` complexity around the agent image vs service images.
- ADD `infra/agent/Dockerfile` building boot.ts; build+push it in CI like a normal service image.
- CHANGE cloud-init ([infra/resources/cloud-init.ts](../infra/resources/cloud-init.ts)) to `docker run`
  the agent image instead of invoking the baked `cella-boot-agent` binary.
- KEEP `boot.ts` + its unit tests unchanged (same logic, new entrypoint via the container).

## Hybrid option (if the serverless angle is still wanted)
Keep **B for boot** (pull, no inbound), and *separately* move **deploy-time orchestration**
(`deploy-service`/`cutover`, today bound to CI runners) into a **Scaleway Serverless Job**
(run-to-completion; Private-Network + Secret-Manager compatible; up-to-5 retries; Pulumi
`job_definition`). That uses the Job for what it is good at without touching the VM's security posture.

## Next step
Prototype B: add `agent/Dockerfile` + the cloud-init `docker run` invocation; tally exact deletions
(`agent/build.ts`, SEA bits of the bake, wait-for-images simplifications) for a concrete LOC delta.
Reversible spike before any commitment.
