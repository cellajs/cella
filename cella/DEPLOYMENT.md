# Deployment

This document explains how a cella app deploys to European cloud provider [Scaleway](https://www.scaleway.com/) using the [Infra CLI](../infra/README.md). First setup: [Fresh installation](./deployment/FRESH_INSTALLATION.md).

### TL;DR

Publishing a release starts an automatic deployment. It creates new servers for that exact version,
checks them, moves traffic without downtime, and removes the old servers.
[Pulumi](https://www.pulumi.com/) manages the cloud resources, and a runner inside the Scaleway organization starts each deploy as a job: GitHub holds the code and no key.
Separate API keys are used for setup, automated deployment, and running servers, so
each stage has only the permissions it needs.

## Overview

Three principles ([infra/README.md](../infra/README.md#core-philosophy)): **create-then-replace** (a new VM generation per deploy, cut over, old one reaped), **content-addressed identity** (a generation is named by what it runs), and **least-privilege keys**. Resources and traffic flow:

```
                             Users / browsers
                                     │  https://<domain>
                                     ▼
            ┌─────────────────────────────────────────────────┐
            │             Scaleway Load Balancer              │  TLS termination,
            │  default    →  frontend VM                      │  one public IP
            │  /api       →  backend VM                       │
            │  /yjs, /mcp, /oauth → worker VMs                │
 ┌──────────┤                                                 ├────────────┐
 │          └───────┬────────────────┬──────────────────┬─────┘            │
 │ Private network  │                │                  │  plain HTTP to   │
 │ (VPC)            │                │                  │  VM private IPs  │
 │                  ▼                ▼                  ▼                  │
 │           ┌─────────────┐  ┌─────────────┐ ┌──────────────────────────┐ │
 │           │ frontend VM │  │ backend VM  │ │  workers: cdc, yjs, mcp, │ │
 │           │   (Caddy)   │  │             │ │  oauth, jobs (run on     │ │
 │           │             │  │             │ │  backend VM when singleVM)│ │
 │           └──────┬──────┘  └──────┬──────┘ └─────────┬────────────────┘ │
 │                  │                │                  │                  │
 │                  │                ▼                  ▼                  │
 │                  │             ┌─────────────────────────┐              │
 │                  │             │       PostgreSQL        │              │
 │                  │             │   (managed, private)    │              │
 │                  │             └─────────────────────────┘              │
 └──────────────────┼──────────────────────────────────────────────────────┘
                    │   Caddy reverse-proxies the SPA bucket
                    ▼   over its public S3 endpoint
     ┌─────────────────────────────┐
     │ SPA bucket · upload buckets │◀────── browsers
     │     (public + private)      │  (direct reads +
     └─────────────────────────────┘  presigned URLs)
```

- **Load balancer:** the only public entrypoint. Backend, yjs, mcp and oauth share the app origin via registry-declared `pathPrefix` values (`/api`, `/yjs`, `/mcp`, `/oauth`). The LB never rewrites paths. `cdc` and `jobs` never take an LB route. The backend's internal listener (`internalPort`: the CDC socket and the Yjs relay's materialize route) is reached only through a private, ACL-guarded LB frontend that admits the private network; no public pool forwards to it. The API has no CORS middleware and serves browser requests from the app origin.
- **VMs:** public IP for egress only (image pulls). All inbound is dropped, including SSH. A new machine pulls every image, its services' and the boot runner's, by the digest its release tag resolved to when the deploy planned it, so a later push under the same tag changes nothing a machine runs. Every service gets its own VM unless `singleVM` co-hosts the workers and the frontend Caddy container on the backend VM. One VM per service and generation: the API is never replicated ([Scaling](./ARCHITECTURE.md#scaling)).
- **Frontend VM:** Caddy adds security headers/CSP and the SPA deep-link fallback.
- **Database:** private-network only. A break-glass toggle can expose it temporarily ([Changing infrastructure](./deployment/CHANGING_INFRASTRUCTURE.md)). The infra turns on logical replication. Where the provider offers `max_slot_wal_keep_size`, set it on the instance (the template's compose uses `2GB`): it bounds the WAL a stopped CDC worker holds, and the worker warns while it is unlimited. Scaleway's managed database does not list that setting, and removes a slot that was inactive for 24 hours. Until then the WAL of a stopped worker fills the volume: the worker's health degrades and then turns unhealthy as its slot falls behind, and when a worker cannot be brought back, drop the slot by hand (`SELECT pg_drop_replication_slot('cdc_slot')`). A slot that is gone, whoever removed it, ends in a rebuild of the sync books ([CDC worker](../cdc/README.md#verify-and-rebuild)).
- **Buckets:** outside the VPC. Browsers read the public upload bucket directly and use presigned URLs for the private one.

## Deploy flow

```
The runner sees a new target (a release, a new commit on a
followed branch, a line in infra/environments) and starts a
run of the environment's main job
        ↓
`infra deploy` (one command): preflights + stack lock
        ↓
A release not built yet: a builder machine fetches the commit,
builds and pushes the images, writes the frontend files, and
is deleted (the app's dependencies never run beside the deploy key)
        ↓
Wave 1: provision + cut over the primary service (backend)
        ↓
Wave 2: ONE stack update provisions every remaining generation;
        cutovers run concurrently per service
        ↓
Verify every public service serves the expected SHA
        ↓
Publish frontend entry files (atomic flip) + smoke checks
(degraded components warn in the log, unhealthy ones fail the run)
        ↓
One final stack update reaps every displaced generation
(the deploy's last step, once smoke passed)
```

The primary service owns migrations. Its boot runner gives the migrate companion 180 seconds, and the companion's database sessions carry a 30-second `lock_timeout` and a 120-second `statement_timeout`, so a migration blocked by another session fails the boot inside the deploy's 6-minute health gate and uploads diagnostics that name the wait and the open transactions. A migration that needs longer runs outside the deploy. `cdc` has no public health endpoint. Its replacement is confirmed by the primary public service coming up healthy.

**Rollback:** nothing is retained for two generations. Pin the environment to the earlier release ([What a deploy deploys](#what-a-deploy-deploys)), or commit a revert, and deploy: same forward path, every service recreated (cdc in place), cached generation reused because `genId` is content-addressed.

## Deploys

Every deploy is a run of the environment's [main job](#the-main-job). The [runner](#the-runner) watches each environment's target and starts a run when it moves; a rotation, an apply that clears a block, and `pnpm infra start-deploy` start one too. The run deploys with one command, on a checkout of the target:

```
pnpm --filter infra run deploy --mode <staging|production> --sha <sha>
```

GitHub holds the code, the pull request checks and the releases, and no Scaleway key. A pull request's `privileged-changes` check says without a key whether merging it owes an apply or an Owner moment ([Changing infrastructure](./deployment/CHANGING_INFRASTRUCTURE.md)).

### What a deploy deploys

Without further instructions staging follows main's newest commit and production the newest release (the highest `x.y.z` tag). An optional file in the repository, `infra/environments`, changes that with one line per environment:

```
# <environment> <target> [retry <n>]
production 0.18.0 retry 1    # held at 0.18.0, deployed once more
staging    branch:my-branch  # staging follows my-branch
```

A target is `branch:<name>`, `releases`, a release tag, or a full commit id. An environment that follows the releases (production) takes `releases` or a release tag only: merging a line is not publishing a release. A line pins an environment until it is removed, also when a newer release is published: that is how production is held or rolled back. The retry counter asks for the same target once more: the runner starts a run when it rises. The runner reads the file at the head of the default branch, so a pin or a rollback takes effect about a minute after it is merged. A file the runner cannot read starts nothing, as a deploy must never guess; `pnpm infra start-deploy` names the target it would start before it asks.

The deploy runs the engine of its target, so a rolled-back release is deployed the way it was made. A release made before a planned break of the engine's state cannot be deployed after it: roll forward instead.

### The main job

Each environment has a Serverless Jobs definition, `<slug>-<mode>-main`, that runs one deploy of a target per run. An apply makes it, as it decides which secrets its runs read. Its runs read two of them by reference, the deploy key's copy (`deploy-key`) and the passphrase, both in the engine folder (`/<slug>-<mode>/engine/`); a start carries only the target and the retry counter, which anyone who reads job runs can see. A run starts from the public `node` image at the root `engines.node` (so a Node bump changes the definition and owes an apply), fetches the target commit (a private repository's with its [read key](./deployment/KEYS.md#repository-read-key)), installs the `infra` and `shared` workspaces without a key in their environment and the Pulumi CLI at the SDK's version, writes the stack's salt into the target's stack file, and runs the target's own deploy, whose last step reaps the displaced generation. Its exit code is its outcome: `0` deployed, `2` blocked (a privileged change is owed: the apply that makes it starts the target again at its end), anything else failed. A run that stops before the deploy, in the fetch or the install, ends failed with `1`.

`pnpm infra start-deploy` starts a run by hand, on your operator key, for the environment's target, and follows it until it ends; its log is in Cockpit under Serverless Jobs. A stack set up before the main job gets its definition from the first apply after a **Rotate keys**, which writes the deploy key's copy; until then the plan warns that the definition waits for it.

### The runner

One small machine per app starts its deploys. Once a minute, for every environment it serves, it finds the target as a deploy does (the environments file at the head of the default branch, else the branch or the newest release) and starts a run of the environment's main job when that target and retry counter have none. Scaleway's list of runs is its memory, and it starts each target once: a failed one waits for a change in git, a blocked one is started again by the apply that clears the block. Scaleway keeps runs for 60 days, so a target whose last run is older than that is started again. Its one key starts and reads job runs in the environments it serves and works from the runner's reserved address only; it is in the machine's user data, with a private repository's read key when there is one ([Repository read key](./deployment/KEYS.md#repository-read-key)).

`infra/runner.json` is committed: the runner's project (`<app>-runner`), the release its program runs from, and the environments it serves. **Set up the runner** (`pnpm infra runner-identity`, your Owner API key) makes the project, the reserved address, the runner's application and key, lets the operator reach that project, and adds the environment it runs for to the file. **Replace the runner** (`pnpm infra runner-replace`, operator key) replaces the machine with one that runs the pinned release for the listed environments: run it after the file changes. Nothing reaches the machine from outside; its log is on the serial console (console → Instances → `<app>-runner` → Console).

### Run records

Every deploy is one run with one record, written at its start, after every step and at its end, in the environment's diagnostics bucket: `runs/<run>/record.json` (environment, target, each step with its duration, the step that failed, the error, and `deployed`, `blocked` or `failed`) and `runs/<run>/log`, the deploy's own lines. A run's id is when it started and what it deploys (`20261015T002005Z-21bae33f7c`), so ids sort by time. Every line goes through the same scrub as a machine's boot log first. A rollout that failed also names each new machine's boot account, or says that machine never uploaded one. `pnpm infra` → **Show runs** (`pnpm infra runs`) lists the last ten on the observer key, beside the main job's runs that left no record (one that ended before the engine was installed shows by Scaleway's state, exit code and message), and shows one in full: a failed machine's boot error, then the end of the run's log. A record that cannot be written does not fail the deploy; the deploy says so in its own output. Show runs flags a record that disagrees with Scaleway's job run, which no key of the engine writes. The bucket keeps versions, so a record the deploy key deletes stays for 60 days. Records and boot accounts expire after 60 days, as Scaleway's job runs do. `pnpm infra runs --machines` shows each service's newest boot account, a reboot outside any run included, and `pnpm infra runs --sha <sha>` every account of that release with the builder's report.

### The builder

The deploy builds nothing itself. When the registry lacks one of the release's images or the frontend bucket its entry files, it makes a builder machine (`<slug>-<mode>-builder-<sha>`, a `POP2-HC-8C-16G` from Scaleway's `docker` image, in the stack's closed security group) that fetches the commit (a private repository's with its [read key](./deployment/KEYS.md#repository-read-key)), builds the boot bundle in a `node` container that holds no key, and the frontend (its docs page with this environment's OpenAPI spec) in another, on its own copy of the checkout, so the app's dependencies reach neither the images' source nor the boot bundle; no container reaches the machine's metadata. It pushes every image with the builder key, tagged with the release and with the build epoch, a short hash of the builder key's id, beside a layer cache under `buildcache-e<epoch>`. The engine's own code lists the frontend's files from the read-only output, and the upload refuses a file outside it or a key other than its place. The builder reports each step to the boot-diagnostics bucket (`boot-diag/builder/<sha>/`). A release counts as built only when its images and files carry the current epoch: **Rotate keys** makes a new builder key, so nothing pushed before a rotation is trusted after it, and the release is built again. The deploy deletes it when the build ends, or when it stops waiting after 30 minutes; one left by a dead deploy is deleted by the next deploy and by a teardown. The release's entry files wait under `releases/<sha>/` in the frontend bucket until the deploy publishes them. The main job installs only the `infra` and `shared` workspaces.

## Rollout strategies

Each service declares its `replacementStrategy` in [config/services.config.ts](../infra/config/services.config.ts).

| Strategy | When | Behavior | Downtime |
| --- | --- | --- | --- |
| **start-first** | backend, frontend, yjs, mcp (LB-backed) | Pulumi provisions the pending generation (`vm-<svc>-<genId>`) next to the active one. [tasks/cutover.ts](../infra/tasks/cutover.ts) reconciles the live LB server list with idempotent `SetBackendServers` calls: expand to `[old,new]`, health/version-gate through the public LB, contract to `[new]`, drain. It always issues the corrective call, so an empty or stale pool is repaired. A failed gate hands the pool back to `[old]` and leaves the follower pools on the old generation. | None (LB overlap). |
| **stop-first** | cdc (holds one Postgres replication slot), jobs (the one cron scheduler) | Pulumi provisions only the new generation, replacing the old in the same `up`. The new worker takes the slot the old one releases on drain (lossless: the slot retains the WAL position, within `max_slot_wal_keep_size`). | Worker gap during replacement. |
| **singleton host** (`singleVM`) | the backend VM when it runs a stop-first worker in-process | start-first with LB overlap: the old VM serves until the new one passes its gate. PostgreSQL lets one session hold the replication slot and pg-boss claims each cron period once, so the new process's cdc and jobs wait until the old VM is gone; the rollout reaps it right after promotion ([tasks/rollout-plans.ts](../infra/tasks/rollout-plans.ts) marks the plan `singletonHost`). | None for HTTP. Realtime events pause from cutover until the slot moves (the reap plus up to a minute); activities are still written. |

### Runtime secret delivery

Runtime secrets reach a VM through `/opt/app/.env.runtime`, a docker-compose `env_file` the boot runner writes from Secret Manager at boot.

- **The Pulumi state holds no password.** The database roles, their passwords and privileges, and the connection strings are made by the operator task [ensure-database.ts](../infra/tasks/ensure-database.ts) through the database API, after each apply and at setup. A role's password is kept in `/<slug>-<mode>/engine/db-password-<role>`, which only the operator reads; a stack whose roles the program made keeps its passwords, recovered from its connection strings. Every consumer's copy of a connection string is rewritten when the endpoint moves.
- **The Pulumi state holds no generated value.** A generated secret (a cookie secret, a token key) and one derived from another (the Yjs relay's public key) are made by the operator task [ensure-secrets.ts](../infra/tasks/ensure-secrets.ts) straight into Secret Manager, after each apply. A value that exists in any consumer's copy is kept and given to copies without one; rotating one is its own action. The program declares their containers only.
- **A deploy writes no secret of the app's.** Values are made and copied by an apply, on the operator key; secret containers and their versions are privileged resources, so a secret added to the registry reaches the stack through **Review & apply changes**, and the deploy key writes only its hand-over bundles. The deploy checks from metadata that every required copy a machine reads holds a version ("Verify runtime secrets are deliverable"). The values it reads are in `/<slug>-<mode>/deploy/`: the machine keys it hands over and the telemetry ingest key, whose copy **Manage runtime secrets** and every apply keep equal to the services' copies.

- **Every secret value must be a single line** (an `env_file` is line-based). Store multi-line values such as a PEM certificate **base64-encoded** and decode them in the consuming service, as `DATABASE_SSL_CA` does (encoded by the postgres store in [resources/stores/postgres-managed.ts](../infra/resources/stores/postgres-managed.ts), decoded in the db clients). The rule lives in [lib/utils/env-file.ts](../infra/lib/utils/env-file.ts): **Manage runtime secrets** refuses a value that breaks it, and the boot runner checks it again.
- An undeliverable `required` secret fails hydration and blocks boot, rather than crash-looping behind a 502.
- A process cannot read a mode-bound secret unless its `MODE` is configured to receive it; `modeSecret()` refuses the read otherwise.

### Certificate issuance and recovery

The load balancer, its DNS records and its certificates are made by the setup's first apply, before any machine, and change only in an apply: a deploy moves the pools' servers and nothing else of the load balancer, so enabling a routed service takes an apply first. Certificate issuance waits for the new DNS record to propagate ([dns-cert-gates.ts](../infra/resources/dns-cert-gates.ts)), and every apply first runs [repair-certs.ts](../infra/tasks/repair-certs.ts) to clear terminally errored certificates, which its `up` then makes anew. It needs no run of its own.

## Configuration

All tunable infra config lives in committed, type-checked files under [config/](../infra/config). Edit and deploy. Each field is a single value or a per-mode map (`{ production: …, staging: … }`).

| File | Owns | Applied by |
| --- | --- | --- |
| [config/services.config.ts](../infra/config/services.config.ts) | Per-service VM size (`instanceType`, required), replacement strategy, drain policy, LB routing, env. Which services exist comes from `appConfig.services.<name>.enabled` | routine deploy |
| [config/general.config.ts](../infra/config/general.config.ts) | DB node type & volume, asset retention | CLI **Review & apply changes** (the database and the buckets' lifecycle rules are privileged) |
| [config/runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts) | Which services receive each runtime secret | CLI **Review & apply changes** (secret containers and values are privileged) |

## Architecture reference

Resource modules, layer order, and the infra file layout: [infra/README.md](../infra/README.md).
