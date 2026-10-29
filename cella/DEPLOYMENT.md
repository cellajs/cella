# Deployment

This document explains how a cella app deploys to European cloud provider [Scaleway](https://www.scaleway.com/) using the [Infra CLI](../infra/README.md).

### TL;DR

Publishing a release starts an automatic deployment: it creates new servers for that exact version,
checks them, moves traffic without downtime and removes the old servers.
[Pulumi](https://www.pulumi.com/) manages the cloud resources, and a runner inside the Scaleway organization starts each deploy, so GitHub holds the code and no key.
Setup, deploys and running servers each use their own API keys, with only the permissions they need.

## Overview

Resources and traffic flow:

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

- **Load balancer:** the only public entrypoint. Every routed service shares the app origin under its own path prefix, so the API needs no CORS.
- **Internal listener:** the backend's second port, for the CDC socket and the Yjs relay's materialize route. Only a private load balancer frontend that admits the private network reaches it.
- **VMs:** all inbound traffic is dropped, SSH included. A machine pulls each image by the digest its tag had when the deploy planned it, so a later push under that tag changes nothing it runs.
- **Placement:** every service gets its own VM, unless `singleVM` co-hosts the workers and the frontend's Caddy on the backend VM. The oauth, mcp and jobs workers and the migrate companion run the backend image in a `MODE` of their own.
- **Frontend VM:** Caddy adds security headers/CSP and the SPA deep-link fallback.
- **Database:** private-network only, with logical replication on for the CDC worker. A break-glass action exposes it for a while ([Runbooks](./deployment/RUNBOOKS.md)).
- **Replication slot:** a stopped CDC worker's slot keeps WAL. Where the provider offers `max_slot_wal_keep_size`, set it; the worker warns while WAL is unbounded. Scaleway's managed database has no such setting: it removes a slot inactive for 24 hours, and until then a stopped worker's WAL fills the volume while its health degrades.
- **Retention job:** the migrate companion schedules the nightly retention procedure in pg_cron's database, `rdb` on Scaleway. Scaleway's admin user may not use the `cron` schema there, so the companion warns and the job stays unscheduled: until the provider grants the admin user that schema and its functions, a deployed database keeps every row the procedure would remove.
- **Buckets:** outside the VPC. Browsers read the public upload bucket directly and use presigned URLs for the private one.

## Deploys

Every deploy is a run of the environment's [main job](#the-main-job). The [runner](#the-runner) starts one when the environment's target moves; a rotation, an action that clears a block and `pnpm infra start-deploy` start one too.

### What a deploy deploys

Production deploys the newest release (the highest `x.y.z` tag). Staging, or any other environment, is optional: it deploys only while the repository's file `infra/environments` has a line for it. The file holds one line per environment:

```
# <environment> <target> [retry <n>]
production 0.18.0 retry 1    # held at 0.18.0, deployed once more
staging    branch:main       # staging follows main's newest commit
```

A target is one of:

- `branch:<name>`: the newest commit of that branch.
- `releases`: the newest release.
- A release tag, such as `0.18.0`.
- A full commit id.

An environment that follows the releases, as production does, takes `releases` or a release tag only: merging a line is not publishing a release. A line holds its environment until it is removed, also when a newer release is published. Raising the retry counter asks for the same target once more. The runner reads the file at the head of the default branch, so a change takes effect about a minute after its merge, and a file it cannot read starts nothing.

**Pausing staging.** Removing staging's line stops its deploys, not its cost: its machines keep running. To stop the cost, tear staging down (`pnpm infra teardown --mode staging`), drop it from `infra/runner.json` and **Replace the runner**.

**Rollback.** No old generation is kept to switch back to: pin the environment to the earlier release, or commit a revert. The deploy takes the same forward path and reuses the earlier build, as a generation is named by what it runs. It also runs the engine of its target, so a release deploys the way it was made. A release made before a planned break of the engine's state cannot be deployed after it: roll forward then.

### The main job

Each environment has a Serverless Jobs definition, `<slug>-<mode>-main`, and every run of it deploys one target. The definition is privileged: an apply makes it, because it names the secrets its runs read, the deploy key's copy and the passphrase. A run fetches the target commit, installs the engine's own workspaces with no key in their environment, and runs the target's own deploy. It starts from the `node` image of the root `engines.node`, so a Node bump owes an apply.

A run ends in one of three outcomes:

- **Deployed:** the target serves.
- **Blocked:** the run's record names what is owed. A privileged change is made by an apply ([Changing infrastructure](./deployment/CHANGING_INFRASTRUCTURE.md)), a required secret stored in **Manage runtime secrets**, and either starts the target again.
- **Failed:** the running release stays, and the target waits for a change in git or a start by hand.

`pnpm infra start-deploy` starts a run on your operator key and follows it to its end. The run's log is in Cockpit under Serverless Jobs.

**Releases only.** In an environment that follows the releases, as production does, the definition's own script refuses a target that no release tag names, before it fetches anything. It catches a start by hand that names the wrong commit. A key that may start runs can also start one with values or a command of its own, which gets past that check: Show runs flags such a run.

### The runner

One small machine per app starts its deploys. Once a minute, for every environment it serves, it finds the target and starts a run of the main job when that target and retry counter have none. Scaleway's list of runs is its memory, so it starts each target once: a failed one waits for a change in git, and a blocked one is started again by the apply that clears the block.

`infra/runner.json` is committed: the runner's project, the release its program runs from and the environments it serves. **Set up the runner** adds an environment ([Fresh installation](./deployment/FRESH_INSTALLATION.md)), and **Replace the runner** (`pnpm infra runner-replace`) gives the machine the file's release and environments: run it after the file changes. Nothing reaches the machine from outside; its log is on its serial console.

### Run records

Every deploy writes one record to the environment's boot-diag bucket, updated after every step: the target, each step with its duration, the failed step with its error, and the outcome, beside the deploy's log. Every machine also uploads a **boot account** at the end of every boot: its boot log and a crashed container's output. Both are scrubbed of secrets before upload, and a failed rollout's record names each new machine's account.

**Show runs** (`pnpm infra runs`, observer key) lists the last ten runs and shows one in full: a failed machine's boot error, then the end of the run's log. `--machines` shows each service's newest boot account, `--sha <sha>` every account of one release with the builder's report.

Records, boot accounts and Scaleway's job runs are kept for 60 days, and the bucket keeps versions, so the deploy key cannot erase one. Show runs flags a record that disagrees with Scaleway's job run, which no key of the engine writes, and a job run started with values or a command the engine never sets. A record that cannot be written does not fail the deploy.

### The builder

When the registry lacks one of the release's images, or the frontend bucket its files, the deploy makes a builder machine that fetches the commit, builds them and is deleted when the build ends. The app's code runs there only in containers that hold no key and reach no machine metadata, and the engine's own code uploads the frontend files from their read-only output. Images and files carry a build epoch derived from the builder key, so after **Rotate keys** nothing pushed before counts as built and the release is built again. Every base image, and BuildKit itself, is pinned by digest, so a tag moved on Docker Hub changes no build; a Node, Caddy or BuildKit bump refreshes its digest.

## Deploy flow

```
The runner sees a new target and starts a run of the main job
        ↓
Stack lock + preflight: no privileged change or required secret may be owed
        ↓
Release not built yet: a builder machine builds the images
and the frontend files, then is deleted
        ↓
Wave 1: provision + cut over the primary service (backend)
        ↓
Wave 2: provision every other service, cut over concurrently
        ↓
Verify every public service serves the expected release
        ↓
Publish the frontend entry files + smoke checks
(degraded components warn, unhealthy ones fail the run)
        ↓
Remove every displaced generation
        ↓
Take the boot key out of the user data of every machine that booted
```

A machine's first boot writes its boot key to disk, where every later boot reads it. Scaleway shows a machine's user data to every key that may read machines, so the key stays in it only until the machine's boot account arrives.

The primary service owns migrations: the migrate companion runs at the boot of its new generation, before the app starts. A migration stuck on a lock fails the deploy, and the boot account names the blocker. A migration that needs longer runs outside the deploy.

## Rollout strategies

Each service declares its `replacementStrategy` in [config/services.config.ts](../infra/config/services.config.ts).

| Strategy | Services | Behavior | Downtime |
| --- | --- | --- | --- |
| **start-first** | backend, frontend, yjs, mcp, oauth (load balancer routes) | The new generation starts beside the old one; the load balancer serves both, checks the new one's health and release, then drops the old one. A failed check hands the pool back to the old generation. | None (load balancer overlap). |
| **stop-first** | cdc (the one replication slot), jobs (the one cron scheduler) | The new generation replaces the old in the same stack update. The new CDC worker resumes the slot where the old one stopped reading, so no change is lost. | Worker gap during replacement. |
| **singleton host** (`singleVM`) | the backend VM when it runs a stop-first worker in-process | start-first, with load balancer overlap. One session holds the replication slot and one process claims each cron period, so the new process's cdc and jobs wait until the old VM is removed, right after promotion. | None for HTTP. Realtime events pause from cutover until the slot moves (the reap plus up to a minute); activities are still written. |

## Runtime secret delivery

At every boot the boot runner reads the machine's runtime secrets from Secret Manager, with each service's own key, into its compose env file.

- **The Pulumi state holds no secret value but two.** After each apply, operator tasks make database passwords and generated secrets, such as a cookie secret, straight into Secret Manager. A value that exists is kept until a [rotation](./deployment/KEYS.md#rotation). The two exceptions sit under the passphrase: the boot key, which each machine's user data carries, and the password of a Redis store an app enables.
- **A deploy writes no secret of the app's.** An apply makes and copies every value, so a secret added to the registry reaches the stack through **Review & apply changes**. Before it makes any machine, the deploy checks that every required copy holds a value. A missing one ends the run blocked, and storing it in **Manage runtime secrets** starts the target again.
- **Every value is a single line**, as an env file is line-based. Store a multi-line value such as a PEM certificate base64-encoded and decode it in the service, as `DATABASE_SSL_CA` does.
- **A missing required secret stops the boot**, so a machine never crash-loops behind a 502.

## Load balancer and DNS

The load balancer, its DNS records and its certificates are made by the setup's first apply, before any machine, and change only in an apply. A deploy moves the pools' servers and nothing else, so enabling a routed service takes an apply first. Every apply also replaces a certificate that failed for good.

## Configuration

All tunable infra config lives in committed, type-checked files under [config/](../infra/config). Each field is a single value or a per-mode map (`{ production: …, staging: … }`).

| File | Owns | Applied by |
| --- | --- | --- |
| [config/services.config.ts](../infra/config/services.config.ts) | Per service: VM size, rollout strategy, drain, load balancer route, env. `appConfig.services.<name>.enabled` decides which exist | A deploy |
| [config/general.config.ts](../infra/config/general.config.ts) | Database node and volume, asset retention | **Review & apply changes** (privileged) |
| [config/runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts) | Which services receive each runtime secret | **Review & apply changes** (privileged) |
