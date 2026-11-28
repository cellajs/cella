# Deployment

This document explains how a Cella app deploys to [Scaleway](https://www.scaleway.com/en/docs/) with the [Infra CLI](../infra/README.md): its resources, a deploy run, secret delivery and the description file.

### TL;DR

Publishing a release starts an automatic deployment: new machines for that exact version replace the old ones once the load balancer sees them healthy. GitHub holds no key: a schedule inside the Scaleway organization starts each deploy. Setup and deploys each use their own [API keys](./deployment/KEYS.md#api-keys), which no machine holds.

## Overview

An environment runs in a private network behind one load balancer.

```
                             Users / browsers
                                     │  https://<domain>
                                     ▼
            ┌─────────────────────────────────────────────────┐
            │             Scaleway Load Balancer              │  TLS termination,
            │  default    →  frontend machine                 │  one public IP
            │  /api       →  backend machine                  │
            │  /yjs, /mcp, /oauth → service machines          │
 ┌──────────┤                                                 ├────────────┐
 │          └───────┬────────────────┬──────────────────┬─────┘            │
 │ Private network  │                │                  │  plain HTTP to   │
 │ (VPC)            │                │                  │  reserved IPs    │
 │                  ▼                ▼                  ▼                  │
 │           ┌─────────────┐  ┌─────────────┐ ┌──────────────────────────┐ │
 │           │  frontend   │  │   backend   │ │ services: cdc, yjs, mcp, │ │
 │           │   (Caddy)   │  │             │ │ oauth, jobs (on the      │ │
 │           │             │  │             │ │ backend when singleVM)   │ │
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
- **Firewall:** a machine admits only the load balancer, on the service and agent ports, and no SSH.
- **Machines:** made for one release and deleted with it.
- **Placement:** a machine per service, its **role**. `singleVM` co-hosts everything on the backend's machine.
- **Agent:** `infra-agent` boots the release and passes the check only while serving it.
- **Pools:** each lists its role's two reserved addresses, the **slots**, for good. Traffic follows the agent's health.
- **Internal listener:** a second backend port for the CDC socket and Yjs materialization, private only.
- **Images:** loaded from the release archive, never a registry. An image whose digest the plan does not name is refused.
- **Frontend:** Caddy adds security headers/CSP and the SPA deep-link fallback.
- **Database:** private, with logical replication on, exposed only by a break-glass action ([Runbooks](./deployment/RUNBOOKS.md)).
- **Replication slot:** while CDC is stopped, its slot keeps WAL. CDC warns while that WAL has no bound.
- **WAL bound:** set `max_slot_wal_keep_size` where the provider offers it.
- **WAL on Scaleway:** unbounded. It can fill the volume until a slot inactive for 24 hours is removed.
- **Buckets:** outside the VPC, read directly when public and by presigned URL when private.

## Deploys

A deploy brings an environment to its **target**, the commit it should run. Every deploy is a run of the environment's [main job](#the-main-job). A [scheduled run](#the-schedule) deploys the target once it moves. A rotation, an action that clears a block and `pnpm cella infra deploy-now` start one too.

### What a deploy deploys

You set what each environment deploys in `cella/infra/environments`, one line per environment. Production deploys the newest release, the highest `x.y.z` tag, unless its line names one. Staging is optional and deploys only while it has a line:

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

Five rules decide what the file deploys:

- **Releases only:** production takes only `releases` or a release tag.
- **Pinned:** a line holds its environment until it is removed, also past a newer release.
- **Retry:** raising the retry counter asks for the same target once more.
- **Default branch:** a change counts from its merge, since a scheduled run reads the file there.
- **Unreadable file:** starts nothing.

**Pausing staging.** Removing staging's line stops its deploys, not its cost. Its machines keep running. To stop the cost, tear staging down with `pnpm cella infra teardown --mode staging`.

**Rollback.** A rollback deploys an earlier release on the same forward path ([Roll back](./deployment/RUNBOOKS.md#roll-back)). No old machine is kept to switch back to.

**The live record.** A file in the boot-diag bucket says which slot serves each role, with its machine, commit, retry counter and rotation. A deploy replaces only the roles the record does not show serving its target:

- **Idempotent:** running the same deploy twice changes nothing.
- **Resumable:** a run that failed halfway resumes with the roles it did not switch.
- **Full replace:** a raised retry counter or a rotation after the machines booted replaces every machine.

### The main job

The main job runs the deploy engine. Each environment has one, the Serverless Jobs definition `<slug>-main`, and every run of it deploys at most one target. Only an apply makes the definition, since it names three privileged things:

- the secret its runs read, the deploy key's copy
- the **engine image** its runs start from, by digest
- the [schedule](#the-schedule) that starts them

The image carries the engine and the **applied description**: the app as the apply's checkout describes it ([What needs an apply](./deployment/CHANGING_INFRASTRUCTURE.md#what-needs-an-apply)). A run installs nothing. The image starts its deploy from the target, the retry counter, the deploy key, the project and the organization. A deploy reads no Pulumi state.

**Deploy now** (`pnpm cella infra deploy-now`) starts a run on your operator key and follows it step by step to its end. It reads the target from this checkout's `cella/infra/environments`, not the default branch's.

A run ends in one of five outcomes:

- **Deployed:** the target serves.
- **Unchanged:** nothing was built or made, since every role served the target already.
- **Blocked:** a required runtime value is missing or empty, before any machine booted ([A blocked deploy](./deployment/RUNBOOKS.md#a-blocked-deploy)).
- **Apply needed:** the target describes the app otherwise, or the run ran outside the engine image ([Apply needed](./deployment/RUNBOOKS.md#apply-needed)).
- **Failed:** roles it did not switch keep their machines, and the target waits for a change in git or a start by hand.

**Releases only.** This check catches a start by hand that names the wrong commit. In production, the engine refuses a target that no release tag names, and a release that the default branch does not contain. It reads that rule from the environment its image was built for. No value a start sets turns the check off or moves the run elsewhere.

A key that may start runs can still start one with a command of its own, past that check. Deploy logs flags such a run.

A tag alone deploys nothing. A `99.0.0` pushed on a commit outside the default branch is refused, and its run ends failed with that reason. Delete the tag, or merge the commit and raise the retry counter.

The rule is as strong as the default branch's ruleset and the tag ruleset together. Whoever may push a tag chooses among the commits the default branch holds, an old release included. The tag ruleset restricts creating, moving and deleting every tag, with the app's release GitHub App as the only bypass ([Releases](./RELEASES.md#setup)).

### The schedule

The schedule makes deploys automatic. Scaleway starts a run of the main job at the cadence you set per environment as `general.schedule.everyMinutes` in [description.yml](../infra/description.yml). A release waits at most that long for its deploy. In return, GitHub holds no key.

An apply writes the schedule, and nothing else needs setting up: it is part of the definition. A scheduled run that starts nothing leaves no record. **Full status** names a schedule that stopped, went missing or whose runs fail. Deploy logs says when the last scheduled run started. Each target deploys once: the records are the schedule's memory.

### Run records

A run record shows how a deploy went. Every deploy writes one to the environment's boot-diag bucket and updates it after every step. Beside the deploy's log, the record holds:

- the target and its retry counter
- each step with its duration
- the failed step with its error
- the outcome

Every new machine also uploads a **boot account** at the end of its first boot: its boot log and a crashed container's output. Both are scrubbed of secrets before upload.

**Deploy logs**, `pnpm cella infra logs` on the observer key, lists the last ten deploys and shows one in full. `--machines` shows each service's newest boot account. `--sha <sha>` shows every account of one release with the builder's report.

Records, boot accounts and archives are kept for 60 days. The deploy key cannot erase a record, since the bucket keeps versions. Deploy logs flags three anomalies:

- **Rewrite:** a version that does not grow the one before, written by the deploy key or a stolen copy.
- **Interrupted:** a record that still says running while no deploy holds the lease, which admits one deploy or operator action at a time.
- **Foreign start:** a job run started with values or a command the engine never sets.

Deploy logs shows a rewritten run as it stood before the rewrite, and `status` reports a rewrite of the newest record.

### The builder

When the boot-diag bucket lacks a release's manifest or one of its archives, the deploy makes a builder machine. The builder fetches the commit, builds every image and the frontend, and is deleted when the build ends. The target's code never runs beside the deploy key.

- **No Scaleway key:** the builder writes its archives and their manifest through links the deploy signed.
- **Checked archives:** the deploy checks every archive against the manifest.
- **Plain files:** the deploy uploads the frontend and refuses any entry but a plain file in the output.
- **Contained code:** the app's code runs only in containers that reach no machine metadata.
- **Pinned images:** a moved tag changes no build, since base images and BuildKit are pinned by digest.

A rollback to a release whose archives expired builds it again.

## Deploy flow

A deploy checks the target and its values before any machine boots:

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
5. The load balancer stops routing to it. Its agent stops the containers after the drain time.
6. The deploy deletes the old machine.

A role whose new machine served keeps it, whatever fails after. The primary role runs migrations. The migrate companion runs at the boot of its new machine, before the app starts, and must succeed. A migration stuck on a lock fails the deploy. The boot account names the blocker. Run a migration that needs longer outside the deploy, and open its transaction with the bulk marker the companion adds to every migration ([CDC](../../cdc/README.md#operational-constraints)).

## Replacement strategies

You set each service's `replacementStrategy` in [description.yml](../infra/description.yml): whether its old and new machines overlap in a switch.

| Strategy | Services | Behavior | Downtime |
| --- | --- | --- | --- |
| **start-first** | backend, frontend, yjs, mcp, oauth (load balancer routes) | The new machine boots on the idle slot beside the old one. Once the pools see it healthy, the old one drains and goes. A new machine that never serves is deleted, and the old one keeps the traffic. | None: the pools hold both until the old one's check turns red. |
| **stop-first** | cdc (the one replication slot), jobs (the one cron scheduler) | The old machine drains and goes first, then the new one boots. The new CDC process resumes the slot where the old one stopped reading. No change is lost. | Service gap during replacement. |
| **singleton host** (`singleVM`) | the backend machine when it runs a stop-first service in-process | start-first. The new process's CDC waits until the old machine drained: one session holds the replication slot. Both processes run the jobs service until then, and one of them claims each cron period. | None for HTTP. Live updates pause from the switch until the slot moves, up to a minute past the drain. No activity is lost. |

## Runtime secret delivery

A machine receives its runtime values once, in an env file. Each value has one container in the runtime folder, the secret folder the deploy key reads. Once the release is built and its description checked, the deploy composes each machine's file from the values its services consume. It writes the file to the boot-diag bucket.

The new machine fetches the file once through a link in its user data and keeps it at `0600`. The deploy deletes the bucket's copy once the machine's boot account arrived, or at the end of the run.

- **No secret in Pulumi state:** after each apply, operator tasks write generated secrets into Secret Manager.
- **Kept until rotation:** a value that exists stays until a [rotation](./deployment/KEYS.md#rotation).
- **No secret from a deploy:** an apply makes every value, through **Review & apply changes**.
- **Uploads key:** written by Update identities.
- **Values fixed at boot:** a changed value reaches only the next deploy's machines, since a reboot fetches nothing.
- **One line per value:** base64-encode a multi-line value and decode it in the service, as `DATABASE_SSL_CA` does.

## Load balancer and DNS

Deploys never change the load balancer: the deploy key only reads it. The setup's first apply makes it, before any machine. Its pools, their reserved addresses, its DNS records and its certificates come with it. They change only in an apply. Every apply also replaces a certificate that failed for good.

## Configuration

You describe what only a deployment knows in [description.yml](../infra/description.yml), which the engine checks at load. The applied description holds this file and the engine's fields of `appConfig` ([What needs an apply](./deployment/CHANGING_INFRASTRUCTURE.md#what-needs-an-apply)). A release that changes one ends **apply needed** until an apply from a checkout with the change.

| Key | What it holds | Applied by |
| --- | --- | --- |
| `services` | Per service: ports and path prefix, which must match `appConfig.services`, machine size, replacement strategy, drain, load balancer route, env. `appConfig.services.<name>.enabled` decides which exist | **Review & apply changes**, then the deploys make machines as it says |
| `general` | Database node and volume, asset retention, the schedule's cadence | **Review & apply changes** (privileged) |
| `runtimeSecrets` | Who makes each runtime secret, its stored name and which services receive it | **Review & apply changes** (privileged) |
