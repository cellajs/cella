# Deployment

This document explains how a cella app deploys to European cloud provider [Scaleway](https://www.scaleway.com/) using the [Infra CLI](../infra/README.md). It assumes you know Scaleway: Instances, Serverless Jobs and Secret Manager ([scaleway.com/en/docs](https://www.scaleway.com/en/docs/)).

### TL;DR

Publishing a release starts an automatic deployment: new machines for that exact version replace the old ones once the load balancer sees them healthy. [Pulumi](https://www.pulumi.com/) manages the foundation, and a schedule inside the Scaleway organization starts each deploy, so GitHub holds no key. Setup and deploys each use their own [API keys](./deployment/KEYS.md#api-keys) with only the permissions they need.
The machines hold none and fetch the release and their secrets through links that end within minutes.

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

- **Load balancer:** the only public way to the machines, one path prefix per service on the app origin.
- **Pools:** each lists its role's two reserved addresses for good, and traffic follows the agent's health.
- **Internal listener:** a second backend port for the CDC socket and Yjs materialization, private only.
- **Machines:** made for one release and deleted with it.
- **Firewall:** a machine admits only the load balancer, on the service and agent ports, and no SSH.
- **Images:** loaded from the release archive, never a registry, refused unless the plan names the digest.
- **Agent:** `infra-agent` boots the release and passes the check only while serving it, not draining.
- **Placement:** a machine per service, unless `singleVM` co-hosts everything on the backend's.
- **Backend image:** also runs the oauth, mcp and jobs workers and the migrate companion.
- **Frontend:** Caddy adds security headers/CSP and the SPA deep-link fallback.
- **Database:** private, with logical replication on, exposed only by a break-glass action ([Runbooks](./deployment/RUNBOOKS.md)).
- **Replication slot:** a stopped CDC worker's slot keeps WAL, and the worker warns while it is unbounded.
- **WAL bound:** set `max_slot_wal_keep_size` where the provider offers it.
- **WAL on Scaleway:** unbounded, so it can fill the volume until a slot inactive for 24 hours is removed.
- **Retention job:** the migrate companion schedules the nightly retention procedure in pg_cron.
- **Retention on Scaleway:** unscheduled while the admin user may not use `cron`, so old rows stay.
- **Buckets:** outside the VPC, read directly when public and by presigned URL when private.

## Deploys

Every deploy is a run of the environment's [main job](#the-main-job) for its **target**, the commit the environment should run. A [scheduled run](#the-schedule) deploys it once the target moves. A rotation, an action that clears a block and `pnpm infra start-deploy` start one too.

### What a deploy deploys

Production deploys the newest release, the highest `x.y.z` tag. Staging is optional. It deploys only while the file `infra/environments` has a line for it. The file holds one line per environment:

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

Merging a line is not publishing a release. The file's rules:

- **Releases only:** an environment that follows the releases, as production, takes only `releases` or a tag.
- **Pinned:** a line holds its environment until it is removed, also past a newer release.
- **Retry:** raising the retry counter asks for the same target once more.
- **Default branch:** a scheduled run reads the file there, so a change counts from its merge.
- **Unreadable file:** starts nothing.

**Pausing staging.** Removing staging's line stops its deploys, not its cost. Its machines keep running. To stop the cost, tear staging down with `pnpm infra teardown --mode staging`.

**Rollback.** No old machine is kept to switch back to. Pin the environment to the earlier release, or commit a revert. The deploy takes the same forward path and reuses the earlier build.

An earlier release that describes the app otherwise ends **apply needed** until an apply from its checkout. A release older than the applied engine reports no description and cannot be deployed. Roll forward then.

**The live record.** A file in the boot-diag bucket says which slot serves each role, with its machine, commit, retry counter and rotation. A deploy replaces only the roles that do not serve its target that way:

- **Idempotent:** running the same deploy twice changes nothing.
- **Resumable:** a run that failed halfway resumes with the roles it did not switch.
- **Full replace:** a raised retry counter, or a rotation since, replaces every machine.

### The main job

Each environment has a Serverless Jobs definition, `<slug>-main`. Every run of it deploys at most one target. Only an apply makes the definition, since it names three privileged things:

- the secret its runs read, the deploy key's copy
- the **engine image** its runs start from, by digest
- the [schedule](#the-schedule) that starts them

The image carries the engine and the **applied description**: the app as the apply's checkout describes it ([What needs an apply](./deployment/CHANGING_INFRASTRUCTURE.md#what-needs-an-apply)). A run installs nothing. The image starts its deploy from four values alone: the target, the retry counter, the deploy key and the project. A deploy reads no Pulumi state and no passphrase.

The target's code never runs beside the deploy key. The builder evaluates the target's own description in a container that holds no key. It reports the description's hash beside the archives' digests. Before the deploy reads a runtime value, it compares that hash with the image's. A release that describes the app otherwise ends **apply needed**.

A run ends in one of five outcomes:

- **Deployed:** the target serves.
- **Unchanged:** every role served the target already, so nothing was built or made.
- **Blocked:** a required runtime value is missing or empty, before any machine booted ([A blocked deploy](./deployment/RUNBOOKS.md#a-blocked-deploy)).
- **Apply needed:** the target describes the app otherwise, or the run ran outside the engine image ([Apply needed](./deployment/RUNBOOKS.md#apply-needed)).
- **Failed:** roles it did not switch keep their machines, and the target waits for a change in git or a start by hand.

`pnpm infra start-deploy` starts a run on your operator key and follows it to its end. It reads the target from this checkout's `infra/environments`, not the default branch's. The run's log is in Cockpit under Serverless Jobs.

**Releases only.** In an environment that follows the releases, the engine refuses a target that no release tag names. It reads that rule from the environment its image was built for. No value a start sets turns the check off or moves the run elsewhere.

The check catches a start by hand that names the wrong commit. A key that may start runs can still start one with a command of its own, past that check. Show runs flags such a run.

The rule is as strong as who may push a tag. A `99.0.0` pushed on any commit is the newest release. So an app's ruleset restricts creating, moving and deleting every tag, with its release GitHub App as the only bypass ([Releases](./RELEASES.md#setup)).

### The schedule

Scaleway starts a run of the main job at the cadence each environment sets as `schedule.everyMinutes` in [config/general.config.ts](../infra/config/general.config.ts). A release waits at most that long for its deploy.

A scheduled run first takes the lease, so one run looks at a time. It then looks for a run record of the environment's target and retry counter. Without one it opens the target's record and deploys the target.

The records are the schedule's memory, so each target deploys once. A failed target waits for a change in git, and a blocked one for an operator to clear the block.

The schedule is part of the definition, so an apply writes it and nothing else needs setting up. A scheduled run that starts nothing leaves no record. **Show status** names a schedule that stopped, went missing or whose runs fail. Show runs says when the last scheduled run started.

### Run records

Every deploy writes one record to the environment's boot-diag bucket and updates it after every step. Beside the deploy's log, the record holds:

- the target and its retry counter
- each step with its duration
- the failed step with its error
- the outcome

Every new machine also uploads a **boot account** at the end of its first boot: its boot log and a crashed container's output. Both are scrubbed of secrets before upload. A failed switch's record names each new machine's account.

**Show runs**, `pnpm infra runs` on the observer key, lists the last ten deploys and shows one in full. `--machines` shows each service's newest boot account. `--sha <sha>` shows every account of one release with the builder's report.

Records, boot accounts and archives are kept for 60 days. The bucket keeps versions, so the deploy key cannot erase a record. Show runs flags three anomalies:

- **Rewrite:** a version that does not grow the one before, written by the deploy key or a stolen copy.
- **Interrupted:** a record that still says running while no deploy holds its lease.
- **Foreign start:** a job run started with values or a command the engine never sets.

Show runs shows a rewritten run as it stood before the rewrite, and `status` reports a rewrite of the newest record.

### The builder

When the boot-diag bucket lacks a release's manifest or one of its archives, the deploy makes a builder machine. The builder fetches the commit, builds every image and the frontend, and is deleted when the build ends.

- **No key:** the builder writes its archives and their manifest through links the deploy signed.
- **Checked archives:** the deploy checks every archive against the manifest.
- **Plain files:** the deploy uploads the frontend and refuses any entry but a plain file in the output.
- **Contained code:** the app's code runs only in containers that reach no machine metadata.
- **Pinned images:** base images and BuildKit are pinned by digest, so a moved tag changes no build.

A rollback to a release whose archives expired builds it again.

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

A **switch** moves one role to its new machine:

1. The deploy makes the machine on the slot that does not serve, at that slot's reserved address.
2. Its agent boots the release and answers the health check.
3. Once every pool of the role shows the new address running, the deploy records it.
4. The deploy orders the old machine to drain, and its agent fails the check.
5. The load balancer stops routing to it, and its agent stops the containers after the drain time.
6. The deploy deletes the old machine.

A new machine that does not serve within the wait is deleted, and the old one never stopped serving. A role whose new machine served keeps it, whatever fails after.

The primary role owns migrations. The migrate companion runs at the boot of its new machine, before the app starts, and must succeed. A migration stuck on a lock fails the deploy, and the boot account names the blocker. A migration that needs longer runs outside the deploy.

## Replacement strategies

Each service declares its `replacementStrategy` in [config/services.config.ts](../infra/config/services.config.ts).

| Strategy | Services | Behavior | Downtime |
| --- | --- | --- | --- |
| **start-first** | backend, frontend, yjs, mcp, oauth (load balancer routes) | The new machine boots on the idle slot beside the old one. Once the pools see it healthy, the old one drains and goes. A new machine that never serves is deleted, and the old one keeps the traffic. | None: the pools hold both until the old one's check turns red. |
| **stop-first** | cdc (the one replication slot), jobs (the one cron scheduler) | The old machine drains and goes first, then the new one boots. The new CDC worker resumes the slot where the old one stopped reading, so no change is lost. | Worker gap during replacement. |
| **singleton host** (`singleVM`) | the backend machine when it runs a stop-first worker in-process | start-first. One session holds the replication slot, so the new process's cdc waits until the old machine drained. Both processes run a jobs worker until then, and one of them claims each cron period. | None for HTTP. Realtime events pause from the switch until the slot moves, up to a minute past the drain. Activities are still written. |

## Runtime secret delivery

Each value has one container in the runtime folder, which only the deploy key reads. Once the release is built and its description checked, the deploy composes each machine's env file from the values its services consume. It writes the file to the boot-diag bucket, which no other key reads.

The new machine fetches the file once through a link in its user data and keeps it at `0600`. The deploy deletes the bucket's copy once the machine's boot account arrived, or at the end of the run.

- **No secret in Pulumi state:** after each apply, operator tasks write generated secrets into Secret Manager.
- **Kept until rotation:** a value that exists stays until a [rotation](./deployment/KEYS.md#rotation).
- **No secret from a deploy:** an apply makes every value, through **Review & apply changes**.
- **Uploads key:** written by Update identities.
- **Values fixed at boot:** a reboot fetches nothing, so a changed value reaches only the next deploy's machines.
- **One line per value:** base64-encode a multi-line value and decode it in the service, as `DATABASE_SSL_CA` does.

## Load balancer and DNS

The setup's first apply makes the load balancer, before any machine. Its pools, their reserved addresses, its DNS records and its certificates come with it. They change only in an apply. The deploy key may read them and write none. Every apply also replaces a certificate that failed for good.

## Configuration

All tunable infra config lives in committed, type-checked files under [config/](../infra/config). A few fields take a per-mode map, such as a service's machine size. Every other field is one value. Every file there is part of the applied description. A release that changes one ends **apply needed** until **Review & apply changes** runs from a checkout that has the change.

| File | Owns | Applied by |
| --- | --- | --- |
| [config/services.config.ts](../infra/config/services.config.ts) | Per service: machine size, replacement strategy, drain, load balancer route, env. `appConfig.services.<name>.enabled` decides which exist | **Review & apply changes**, then the deploys make machines as it says |
| [config/general.config.ts](../infra/config/general.config.ts) | Database node and volume, asset retention, the schedule's cadence | **Review & apply changes** (privileged) |
| [config/runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts) | Which services receive each runtime secret | **Review & apply changes** (privileged) |
