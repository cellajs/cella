# Deployment

This document explains how a cella app deploys to European cloud provider [Scaleway](https://www.scaleway.com/) using the [Infra CLI](../infra/README.md).

### TL;DR

Publishing a release starts an automatic deployment: it creates new machines for that exact version,
waits until the load balancer sees them healthy, then drains and removes the old machines.
[Pulumi](https://www.pulumi.com/) manages the foundation (network, load balancer, database, buckets), a deploy makes and deletes the machines itself, and a schedule inside the Scaleway organization starts each deploy, so GitHub holds the code and no key.
Every deploy runs the engine the last apply published, and a release that describes the app otherwise waits for an apply.
Setup and deploys each use their own [API keys](./deployment/KEYS.md#api-keys), with only the permissions they need, and the machines hold none: they fetch the release and their secrets through links that end within minutes.

## Overview

Resources and traffic flow:

```
                             Users / browsers
                                     │  https://<domain>
                                     ▼
            ┌─────────────────────────────────────────────────┐
            │             Scaleway Load Balancer              │  TLS termination,
            │  default    →  frontend machine                 │  one public IP
            │  /api       →  backend machine                  │
            │  /yjs, /mcp, /oauth → worker machines           │
 ┌──────────┤                                                 ├────────────┐
 │          └───────┬────────────────┬──────────────────┬─────┘            │
 │ Private network  │                │                  │  plain HTTP to   │
 │ (VPC)            │                │                  │  reserved IPs    │
 │                  ▼                ▼                  ▼                  │
 │           ┌─────────────┐  ┌─────────────┐ ┌──────────────────────────┐ │
 │           │  frontend   │  │   backend   │ │  workers: cdc, yjs, mcp, │ │
 │           │   (Caddy)   │  │             │ │  oauth, jobs (on the     │ │
 │           │             │  │             │ │  backend when singleVM)  │ │
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

- **Load balancer:** the only public way to the machines. Every routed service shares the app origin under its own path prefix, so the API needs no CORS. Each pool lists its role's two reserved addresses for good, and its health check asks the machine's agent, so traffic moves by health and no deploy edits a pool.
- **Internal listener:** the backend's second port, for the CDC socket and the Yjs relay's materialize route. Only a private load balancer frontend that admits the private network reaches it.
- **Machines:** made for one release and deleted with it. Inbound traffic is dropped, SSH included, but the load balancer's own address on the service and agent ports. A machine loads each image from the release's archive and refuses one whose digest differs from the one the deploy put in its plan, so nothing written to the bucket later changes what it runs. It never reaches a registry.
- **Agent:** every machine runs `infra-agent` beside its app. It boots the release, answers the load balancer's check with 200 only while the service serves that release and the machine is not draining, and drains when its manifest says so.
- **Placement:** every service gets its own machine, unless `singleVM` co-hosts the workers and the frontend's Caddy on the backend's. The oauth, mcp and jobs workers and the migrate companion run the backend image as a `SERVICE` of their own.
- **Frontend:** Caddy adds security headers/CSP and the SPA deep-link fallback.
- **Database:** private-network only, with logical replication on for the CDC worker. A break-glass action exposes it for a while ([Runbooks](./deployment/RUNBOOKS.md)).
- **Replication slot:** a stopped CDC worker's slot keeps WAL. Where the provider offers `max_slot_wal_keep_size`, set it; the worker warns while WAL is unbounded. Scaleway's managed database has no such setting: it removes a slot inactive for 24 hours, and until then a stopped worker's WAL fills the volume while its health degrades.
- **Retention job:** the migrate companion schedules the nightly retention procedure in pg_cron's database, `rdb` on Scaleway. Scaleway's admin user may not use the `cron` schema there, so the companion warns and the job stays unscheduled: until the provider grants the admin user that schema and its functions, a deployed database keeps every row the procedure would remove.
- **Buckets:** outside the VPC. Browsers read the public upload bucket directly and use presigned URLs for the private one.

## Deploys

Every deploy is a run of the environment's [main job](#the-main-job) for its **target**, the commit the environment should run. A [scheduled run](#the-schedule) deploys it once the target moves; a rotation, an action that clears a block and `pnpm infra start-deploy` start one too.

### What a deploy deploys

Production deploys the newest release (the highest `x.y.z` tag). Staging is optional: it deploys only while the repository's file `infra/environments` has a line for it. The file holds one line per environment:

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

An environment that follows the releases, as production does, takes `releases` or a release tag only: merging a line is not publishing a release. A line holds its environment until it is removed, also when a newer release is published. Raising the retry counter asks for the same target once more. A scheduled run reads the file at the head of the default branch, so a change takes effect at the first scheduled run after its merge, and a file it cannot read starts nothing.

**Pausing staging.** Removing staging's line stops its deploys, not its cost: its machines keep running. To stop the cost, tear staging down (`pnpm infra teardown --mode staging`).

**Rollback.** No old machine is kept to switch back to: pin the environment to the earlier release, or commit a revert. The deploy takes the same forward path and reuses the earlier build, as a build is kept by its commit. It runs the applied engine, so an earlier release whose description of the app differs ends **apply needed** until an apply from a checkout at that release publishes its engine. A release older than the applied engine reports no description and cannot be deployed: roll forward then.

**The live record.** `control/<mode>/live.json` in the boot-diag bucket says, per role, which slot serves, its machine and its commit, and the retry counter and rotation it was booted under. A deploy replaces only the roles that do not serve its target that way: running the same deploy twice changes nothing, and a run that failed halfway resumes with the roles it did not switch. A raised retry counter, or a rotation since, replaces every machine.

### The main job

Each environment has a Serverless Jobs definition, `<slug>-main`, and every run of it deploys at most one target. The definition is privileged: an apply makes it, because it names the secret its runs read, the deploy key's copy, the **engine image** its runs start from, by digest, and the [schedule](#the-schedule) that starts them. The image carries the engine and the **applied description**: the app as the checkout the apply ran from describes it to the engine ([What needs an apply](./deployment/CHANGING_INFRASTRUCTURE.md#what-needs-an-apply)). A run installs nothing: the image starts its deploy with the target, the retry counter, the deploy key and the project, and no other value a start sets. A deploy reads no Pulumi state and no passphrase.

The target's code never runs beside the deploy key. The builder evaluates the target's own description from its checkout, in a container that holds no key, and reports its hash beside the archives' digests. Before the deploy reads a runtime value, it holds that hash against the image's, and a release that describes the app otherwise ends **apply needed**.

A run ends in one of five outcomes:

- **Deployed:** the target serves.
- **Unchanged:** every role served the target already; nothing was built or made.
- **Blocked:** the run stopped before it booted a machine of the release, on a required runtime value that is missing or empty, which its record names ([A blocked deploy](./deployment/RUNBOOKS.md#a-blocked-deploy)).
- **Apply needed:** the target describes the app otherwise than the applied engine, or the run did not start from an engine image; nothing was composed or booted ([Apply needed](./deployment/RUNBOOKS.md#apply-needed)). The apply from a checkout at the target starts it again.
- **Failed:** every role it did not switch keeps its machine, and the target waits for a change in git or a start by hand.

`pnpm infra start-deploy` starts a run on your operator key and follows it to its end. It reads the target from this checkout's `infra/environments`; a scheduled run reads the default branch's. The run's log is in Cockpit under Serverless Jobs.

**Releases only.** In an environment that follows the releases, as production does, the engine refuses a target that no release tag names, before the deploy starts. It reads the rule from the environment its image was built for, so no value a start sets turns the check off or moves the run elsewhere: it catches a start by hand that names the wrong commit. A key that may start runs can still start one with a command of its own, which gets past that check: Deploy logs flags such a run.

The rule is as strong as who may push a tag: `99.0.0` pushed on any commit is the newest release. So an app sets a ruleset that restricts creating, moving and deleting every tag, with its release GitHub App as the only bypass ([Releases](./RELEASES.md#setup)).

### The schedule

Scaleway starts a run of the main job every minute in production and every five minutes in staging: the cadence is each environment's to set, as `schedule.everyMinutes` in [config/general.config.ts](../infra/config/general.config.ts), and a release waits at most that long for its deploy. A scheduled run takes the lease before it reads anything, so one run looks at a time; when a deploy or an operator action holds the lease, it ends at once and the next one looks again. It then finds the environment's target and looks for a run record of that target and retry counter: with one it ends within seconds and names the run it found, without one it opens the target's record and deploys the target itself. The records are the schedule's memory, so it deploys each target once: a failed one waits for a change in git, a blocked one for an operator to clear the block, and a deploy that died before it finished leaves a record that reads as interrupted.

The schedule is part of the definition, so an apply writes it and nothing else is set up for the deploys to start. A scheduled run that starts nothing leaves no record; **Full status** names a schedule that stopped, one missing from the definition or whose runs fail, and Deploy logs says when the last scheduled run started.

### Run records

Every deploy writes one record to the environment's boot-diag bucket, updated after every step: the target and its retry counter, each step with its duration, the failed step with its error, and the outcome, beside the deploy's log. Every new machine also uploads a **boot account** at the end of its first boot, through its link: its boot log and a crashed container's output. Both are scrubbed of secrets before upload, and a failed switch's record names each new machine's account.

**Deploy logs** (`pnpm infra runs`, observer key) lists the last ten deploys, below one sentence on the last scheduled run, and shows one in full: a failed machine's boot error, then the end of the run's log. `--machines` shows each service's newest boot account, `--sha <sha>` every account of one release with the builder's report.

Records, boot accounts and Scaleway's job runs are kept for 60 days, and the bucket keeps versions, so the deploy key cannot erase one. Deploy logs reads a record by its first version: each later version counts only where it grows the one before (the same steps with the same outcomes, then more steps or the end; the log likewise only grows), and the first version that does not is named as a rewrite, as only the deploy key or a stolen copy writes there; the run is shown as it stood before it, and `status` reports a rewrite of the newest record. Deploy logs also reads a record that still says running as interrupted unless a deploy holds the lease under its run, and flags a job run started with values or a command the engine never sets. A record a deploy cannot write does not fail it; the record a scheduled run opens must be written before it deploys.

### The builder

When the boot-diag bucket lacks the release's manifest, or an archive the manifest names, the deploy makes a builder machine that fetches the commit, builds every image and the frontend, and is deleted when the build ends. The builder holds no Scaleway key: it writes each image as an archive Docker loads, the frontend's files as one archive, and last the manifest with each archive's digest and the hash of the release's own description of the app, all under `releases/<sha>/` through links the deploy signed before it made the machine, and reports its steps the same way. The deploy checks every archive against the manifest, then uploads the frontend files from their archive with its own key, refusing any entry but a plain file inside the build's output. The app's code runs on the builder only in containers that reach no machine metadata. Every base image, and BuildKit itself, is pinned by digest, so a tag moved on Docker Hub changes no build; a Node, Caddy or BuildKit bump refreshes its digest. Archives are kept 60 days; a rollback to an older release builds it again.

## Deploy flow

```
A scheduled run finds a target without a run, and deploys it
        ↓
The lease, then the live record: every role that serves the
target already is left as it is (all of them: unchanged)
        ↓
A run outside the engine image ends apply needed, and a
required value the runtime folder lacks ends it blocked
        ↓
Release not built yet: a builder machine writes the archives,
the frontend files and the release's description through
links, then is deleted
        ↓
The release's description against the applied engine's:
one that differs ends the run apply needed
        ↓
Each role's env file, from the runtime folder: a value that
is empty or not one line ends the run blocked
        ↓
The primary role (backend) switches alone, then every other
role at once: boot on the idle slot, wait until its pools
serve it, record it, drain and delete the old machine
        ↓
The new machines' links and env files go once they booted
        ↓
Publish the frontend entry files + smoke checks
(degraded components warn, unhealthy ones fail the run)
```

A **switch** of one role: the deploy makes the new machine through the Instance API on the slot that does not serve, with its private NIC at that slot's reserved address. Its agent boots the release and answers the check; once every pool of the role shows the new address running, the deploy records it and writes `drain` into the old machine's manifest. The old agent then answers 503, the load balancer stops routing to it, the agent keeps its connections for the role's drain seconds and stops the containers, and the deploy deletes the machine. A new machine that does not serve within the wait is deleted, and the old one never stopped serving; a role whose new machine served keeps it, whatever fails after.

The primary role owns migrations: the migrate companion runs at the boot of its new machine, before the app starts, as the app's Compose dependency that must exit 0. A migration stuck on a lock fails the deploy, and the boot account names the blocker. A migration that needs longer runs outside the deploy.

## Replacement strategies

Each service declares its `replacementStrategy` in [config/services.config.ts](../infra/config/services.config.ts).

| Strategy | Services | Behavior | Downtime |
| --- | --- | --- | --- |
| **start-first** | backend, frontend, yjs, mcp, oauth (load balancer routes) | The new machine boots on the idle slot beside the old one; once the pools see it healthy, the old one drains and goes. A new machine that never serves is deleted, and the old one keeps the traffic. | None: the pools hold both until the old one's check turns red. |
| **stop-first** | cdc (the one replication slot), jobs (the one cron scheduler) | The old machine drains and goes first, then the new one boots. The new CDC worker resumes the slot where the old one stopped reading, so no change is lost. | Worker gap during replacement. |
| **singleton host** (`singleVM`) | the backend machine when it runs a stop-first worker in-process | start-first. One session holds the replication slot, so the new process's cdc waits until the old machine drained. Both processes run a jobs worker until then, and one of them claims each cron period. | None for HTTP. Realtime events pause from the switch until the slot moves (the drain plus up to a minute); activities are still written. |

## Runtime secret delivery

Each value has one container in the runtime folder, which only the deploy key reads. Once the release is built and its description checked, the deploy composes each machine's env file from the values its services consume and writes it to the boot-diag bucket, which no other key reads; the new machine fetches it once through a link in its user data and keeps it at `0600`, and the deploy deletes it once the machine's boot account arrived, or at the end of the run. A stop-first machine that a failed switch kept keeps its file, as a late boot may still need it, until the bucket's rule removes it within a day.

- **The Pulumi state holds no machine and no secret value of the app's.** After each apply, operator tasks make database passwords and generated secrets, such as a cookie secret, straight into Secret Manager. A value that exists is kept until a [rotation](./deployment/KEYS.md#rotation).
- **A deploy writes no secret of the app's.** An apply makes every value, so a secret added to the registry reaches the stack through **Review & apply changes**; Update identities writes the uploads key.
- **A machine keeps the values it booted with.** A reboot runs its env file again and fetches nothing, so a changed value, or one an apply removed, reaches the machines the next deploy makes: a new release, or a rotation.
- **Every value is a single line**, as an env file is line-based. Store a multi-line value such as a PEM certificate base64-encoded and decode it in the service, as `DATABASE_SSL_CA` does.

## Load balancer and DNS

The load balancer, its pools, the reserved addresses they list, its DNS records and its certificates are made by the setup's first apply, before any machine, and change only in an apply: the deploy key may read them and write none. Every apply also replaces a certificate that failed for good.

## Configuration

All tunable infra config lives in committed, type-checked files under [config/](../infra/config). A service's machine size, the database's node type and volume, and the asset retention take a single value or a per-mode map (`{ production: …, staging: … }`); every other field is one value. Every file there is part of the applied description: a release that changes one deploys once **Review & apply changes** ran from a checkout that has the change, and ends apply needed until then.

| File | Owns | Applied by |
| --- | --- | --- |
| [config/services.config.ts](../infra/config/services.config.ts) | Per service: machine size, replacement strategy, drain, load balancer route, env. `appConfig.services.<name>.enabled` decides which exist | **Review & apply changes**, then the deploys make machines as it says |
| [config/general.config.ts](../infra/config/general.config.ts) | Database node and volume, asset retention, the schedule's cadence | **Review & apply changes** (privileged) |
| [config/runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts) | Which services receive each runtime secret | **Review & apply changes** (privileged) |
