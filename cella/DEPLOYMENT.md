# Deployment

This document explains how a cella app deploys to European cloud provider [Scaleway](https://www.scaleway.com/) using the the [Infra CLI](../infra/README.md).

### TL;DR

Publishing a release starts an automatic deployment. It creates new servers for that exact version,
checks them, moves traffic without downtime, and removes the old servers.
[Pulumi](https://www.pulumi.com/) manages the cloud resources and GitHub Actions triggers the deploy command.
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
- **Database:** private-network only. A break-glass toggle can expose it temporarily ([Changing infrastructure](#changing-infrastructure)). The infra turns on logical replication. Where the provider offers `max_slot_wal_keep_size`, set it on the instance (the template's compose uses `2GB`): it bounds the WAL a stopped CDC worker holds, and the worker warns while it is unlimited. Scaleway's managed database does not list that setting, and removes a slot that was inactive for 24 hours. Until then the WAL of a stopped worker fills the volume: the worker's health degrades and then turns unhealthy as its slot falls behind, and when a worker cannot be brought back, drop the slot by hand (`SELECT pg_drop_replication_slot('cdc_slot')`). A slot that is gone, whoever removed it, ends in a rebuild of the sync books ([CDC worker](../cdc/README.md#verify-and-rebuild)).
- **Buckets:** outside the VPC. Browsers read the public upload bucket directly and use presigned URLs for the private one.

## Deploy flow

```
Release published, push to main (staging), or manual dispatch
        ↓
`infra deploy` (one command): preflights + stack lock
        ↓
A release not built yet: a builder machine fetches the commit,
builds and pushes the images, writes the frontend files, and
is deleted (no app code runs beside the deploy key)
        ↓
Wave 1: provision + cut over the primary service (backend)
        ↓
Wave 2: ONE stack update provisions every remaining generation;
        cutovers run concurrently per service
        ↓
Verify every public service serves the expected SHA
        ↓
Publish frontend entry files (atomic flip) + smoke checks
(degraded components warn with an annotation, unhealthy ones fail the run)
        ↓
One final stack update reaps every displaced generation
(CI passes `--defer-reap` and runs that update as a follow-up `reap` job)
```

The primary service owns migrations. Its boot runner gives the migrate companion 180 seconds, and the companion's database sessions carry a 30-second `lock_timeout` and a 120-second `statement_timeout`, so a migration blocked by another session fails the boot inside the deploy's 6-minute health gate and uploads diagnostics that name the wait and the open transactions. A migration that needs longer runs outside the deploy. `cdc` has no public health endpoint. Its replacement is confirmed by the primary public service coming up healthy.

**Rollback:** nothing is retained for two generations. Pin the environment to the earlier release ([What a deploy deploys](#what-a-deploy-deploys)), or commit a revert, and deploy: same forward path, every service recreated (cdc in place), cached generation reused because `genId` is content-addressed.

<a id="credentials"></a>

## API keys

Scaleway API keys descend in privilege, each in a different store, each minting the next. Every key is named after its bearer, the way the Scaleway console shows it.

| Key | Permissions | Lifetime | Where stored |
| --- | --- | --- | --- |
| **Owner API key** (your own key as organization Owner) | Everything, from every address: Scaleway holds an Owner to no policy condition. The one key that writes IAM. The CLI asks for one where identities are made or removed: a first setup, **Rotate keys**, **Set up operator key**, **Tear down stack** (its second part), minting a managed key, and **Update identities**. Nothing else runs on it: the buckets admit no person. | Create one for the occasion in the console and revoke it afterwards; the setup offers to revoke it as its last call. Keep the Owner account for recovery, with MFA. | Nowhere on the machine. The CLI takes it at the prompt and never reads `SCW_OWNER_*` from a file or the environment. |
| **Operator application key** (`<app>-operator`, one per app) | Every product in the projects of the app's environments, plus IAM read. It writes no IAM: a key that does cannot be held to its own app. Scaleway accepts it **from your dedicated IP address only**: every rule of its policy carries that condition. The key for day-to-day privileged work, the same one in every environment. | Long-lived. Created and replaced by `pnpm infra operator-key` with your Owner API key ([Operator key](#operator-key)). | Your password manager only: shown once, stored nowhere by the CLI. You paste it, access key and secret key, once per run of the CLI, which keeps it in memory until you quit. |
| **CI deploy application key** (`<slug>-<mode>-ci-deploy`) | In the stack's project: machines set by set (servers, IPs, private NICs, volumes; a builder machine among them), block storage, IPAM, load balancers, private networks and object storage; **read-only** on the registry (the builder pushes the images), VPC, RDB and jobs (privileged resources). Secret Manager by folder ([deploy-policy.ts](../infra/lib/scaleway/deploy-policy.ts)): it sees every container's metadata in the project (Scaleway refuses a list call under any condition); it writes versions in the services' folders (values a store supplies, such as the database CA) and the hand-over folder; it reads values in the deploy folder only, so it reads no secret of the app's. IAM read. No IAM write and no DNS write: the records follow the load balancer's address, which the setup's first apply makes. | Long-lived. Rotate via the CLI **Rotate keys** action ([Key rotation](#key-rotation)) | The stack's GitHub Environment (`staging` or `production`) secrets `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`, the names the Scaleway provider reads. |
| **Observer application key** (`<app>-observer`, one per app) | Read-only, set by set, in the projects of the app's environments: instances, load balancers, databases, networks, registry, DNS, secret metadata (no value), jobs, object storage reads; plus IAM read. Of the buckets, only the state bucket and the boot-diagnostics bucket admit it, to read. Scaleway accepts it from your dedicated address only, as the operator key. The key for `status`, the plan of an identity update, and an agent that reads for you. | Long-lived. Made at an Owner moment: a first setup, or **Update identities** on a machine without one; **Rotate keys** replaces it. | `infra/.env.<mode>` as `SCW_OBSERVER_ACCESS_KEY` / `SCW_OBSERVER_SECRET_KEY` (0600, never committed). One key serves every environment: an Owner moment writes it into each env file on the machine that holds one. |
| **Boot + service application keys** (`<slug>-<mode>-boot`, `<slug>-<mode>-vm-<service>`) | Boot key: registry pull + boot-diag write + handoff-only secret read. Service key: path-conditioned secret read of its own folder, which holds a copy of every secret the service consumes. The backend additionally gets granular S3 object sets. | One standing key per identity, made at an Owner moment (a first setup, **Update identities** when one is missing, **Rotate keys** for all of them). A deploy hands it over and writes no IAM; it stops when an identity holds any other key. | `/<slug>-<mode>/deploy/machine-key-<service>` in Secret Manager, which the deploy key reads. The boot key is baked into machine cloud-init; each service key reaches its machine through a single-access handoff bundle, one per service the machine carries. Not in stack config. |
| **Builder application key** (`<slug>-<mode>-builder`) | Registry push and object writes in the project; of the buckets, only the frontend bucket admits it, to list and write the release's files (it deletes none). | One standing key, made at the Owner moments that make the machine keys. | `/<slug>-<mode>/deploy/machine-key-builder`, handed over read-once to a builder machine. |

The **Pulumi passphrase** sits outside the chain: it encrypts the stack's secret outputs in the state bucket ([Passphrase rotation](#passphrase-rotation)). Nobody types it: it is stored in Secret Manager at `/<slug>-<mode>/engine/pulumi-passphrase`, outside every VM's reach, and the CLI reads it with the operator key your session is unlocked with. CI keeps its own copy as a GitHub Environment secret. A stack set up before this copy existed asks for the passphrase once, at the first unlocked action, and stores it.

On an operator machine `infra/.env.<mode>` therefore holds the observer key and nothing a change needs: the CLI reads neither a privileged key nor the passphrase from a file or the environment, as a reference or as a value, and names what it found there. That is deliberate. A value on disk would let a script on the machine change infrastructure with nobody at the terminal ([env-files.ts](../infra/lib/utils/env-files.ts)). The admin application key is retired: `SCW_ADMIN_*`, and the `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` / `SCW_STATE_*` names it had in the file before, are not read, and the CLI says to remove them; in the process environment `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` keep meaning the key the process was started with (a CI runner). On start the CLI prints which principal the observer key belongs to, whether the stack is locked, what is live, and whether Scaleway takes the operator key from this machine's address.

Every action that reads or writes the Pulumi state, a lock included, takes the operator key, asked once per run of the CLI and kept in memory until you quit. The observer key changes nothing. Each action still verifies the passphrase against the stack.

## CI deploys

[.github/workflows/deploy.yml](../.github/workflows/deploy.yml) is a thin trigger (push to main, release published, manual dispatch) for the reusable [.github/workflows/deploy-pipeline.yml](../.github/workflows/deploy-pipeline.yml): `setup` finds the target ([What a deploy deploys](#what-a-deploy-deploys)) and derives names from config, and one `deploy` job, on a checkout of the target, runs a single command:

```
pnpm --filter infra run deploy --mode <staging|production> --sha <sha> --git-ref <ref>
```

- Pushes to main auto-deploy **staging**. Create a `staging` [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) holding the `SCW_*` secrets before merging to main. Until `Pulumi.staging.yaml` carries the `infra:bootstrapComplete` marker, the deploy job is skipped. The newest push cancels a superseded in-flight staging run (`cancel-in-progress`). Production rollouts never cancel. Manual: Actions → Deploy → Run workflow → `staging`.
- **Production** deploys only on a published release or a manual dispatch. For a manual promote, give the `production` GitHub Environment required reviewers. The run then pauses for approval.

### What a deploy deploys

Without further instructions a push to main deploys main's newest commit to staging, a published release deploys the newest release (the highest `x.y.z` tag) to production, and a manual run deploys the commit it was started on. An optional file in the repository, `infra/environments`, changes that with one line per environment:

```
# <environment> <target> [retry <n>]
production 0.18.0 retry 1    # held at 0.18.0, deployed once more
staging    branch:my-branch  # staging follows my-branch
```

A target is `branch:<name>`, `releases`, a release tag, or a full commit id. A line pins an environment until it is removed, also when a newer release is published: that is how production is held or rolled back. The retry counter asks for the same target once more; the runner that replaces these workflows starts a run when it rises. The file is read from the commit that started the run, so a pin or a rollback of production takes a merge and then a manual run of production on main. A file the deploy cannot read stops it, as a deploy must never guess; `pnpm --filter infra target --mode <environment>` prints what it would deploy.

The deploy runs the engine of its target, so a rolled-back release is deployed the way it was made. A release made before a planned break of the engine's state cannot be deployed after it: roll forward instead.

### The main job

Each environment has a Serverless Jobs definition, `<slug>-<mode>-main`, that runs one deploy of a target per run: the deploy that will replace these workflows. An apply makes it, as it decides which secrets its runs read. Its runs read two of them by reference, the deploy key's copy (`deploy-key`) and the passphrase, both in the engine folder (`/<slug>-<mode>/engine/`); a start carries only the target and the retry counter, which anyone who reads job runs can see. A run starts from the public `node` image at the root `engines.node` (so a Node bump changes the definition and owes an apply), fetches the target commit (a private repository's with its [read key](#repository-read-key)), installs the `infra` and `shared` workspaces and the Pulumi CLI at the SDK's version, and runs the target's own deploy and reap. Its exit code is its outcome: `0` deployed, `2` blocked (a privileged change is owed: apply, then start the target again), anything else failed. A run that stops before the deploy, in the fetch or the install, ends failed with `1`.

`pnpm infra start-deploy` starts a run by hand, on your operator key, for the environment's target, and follows it until it ends; its log is in Cockpit under Serverless Jobs. A stack set up before the main job gets its definition from the first apply after a **Rotate keys**, which writes the deploy key's copy; until then the plan warns that the definition waits for it.

### Run records

Every deploy is one run with one record, written at its end whatever the outcome, in the environment's diagnostics bucket: `runs/<run>/record.json` (environment, target, each step with its duration, the step that failed, the error, and `deployed`, `blocked` or `failed`) and `runs/<run>/log`, the deploy's own lines. A run's id is when it started and what it deploys (`20261015T002005Z-21bae33f7c`), so ids sort by time. Every line goes through the same scrub as a machine's boot log first. `pnpm infra` → **Show runs** (`pnpm infra runs`) lists the last ten on the observer key and shows one in full with the end of its log. A record that cannot be written does not fail the deploy; the deploy says so in its own output. Records expire after 60 days, as Scaleway's job runs do.

### Bring your own CI

1. **Env**: export `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_DEFAULT_PROJECT_ID`, `SCW_DEFAULT_ORGANIZATION_ID`, `PULUMI_CONFIG_PASSPHRASE` (the workflow maps its `SCW_PROJECT_ID` / `SCW_ORGANIZATION_ID` secrets onto the `SCW_DEFAULT_*` names the Scaleway provider reads). Install node, pnpm, git and the pulumi CLI: the deploy needs no Docker.
2. **Deploy**: `pnpm --filter infra run deploy --mode <mode> --sha <sha>` for a commit pushed to the repository that the root `package.json` names. Safe to re-run. The stack lock serializes concurrent attempts.

The deploy builds nothing itself. When the registry lacks one of the release's images or the frontend bucket its entry files, it makes a builder machine (`<slug>-<mode>-builder-<sha>`, a `POP2-HC-8C-16G` from Scaleway's `docker` image, in the stack's closed security group) that fetches the commit (a private repository's with its [read key](#repository-read-key)), installs the workspace and builds the boot bundle and the frontend in a `node` container that holds no key, pushes every image (the services' while the frontend builds, with a layer cache in the registry under `buildcache-r<rotation counter>` that only the builder key writes, so a rotation starts a clean one) and writes the frontend's files with the builder key, and reports each step to the boot-diagnostics bucket (`boot-diag/builder/<sha>/`). The deploy deletes it when the build ends, or when it stops waiting after 30 minutes; one left by a dead deploy is deleted by the next deploy and by a teardown. The release's entry files wait under `releases/<sha>/` in the frontend bucket until the deploy publishes them. Jobs that hold deploy secrets install only the `infra` and `shared` workspaces and do not use the shared pnpm cache. `--git-ref`, when provided, gates production deploys to main/release refs.

## Rollout strategies

Each service declares its `replacementStrategy` in [config/services.config.ts](../infra/config/services.config.ts).

| Strategy | When | Behavior | Downtime |
| --- | --- | --- | --- |
| **start-first** | backend, frontend, yjs, mcp (LB-backed) | Pulumi provisions the pending generation (`vm-<svc>-<genId>`) next to the active one. [tasks/cutover.ts](../infra/tasks/cutover.ts) reconciles the live LB server list with idempotent `SetBackendServers` calls: expand to `[old,new]`, health/version-gate through the public LB, contract to `[new]`, drain. It always issues the corrective call, so an empty or stale pool is repaired. A failed gate hands the pool back to `[old]` and leaves the follower pools on the old generation. | None (LB overlap). |
| **stop-first** | cdc (holds one Postgres replication slot), jobs (the one cron scheduler) | Pulumi provisions only the new generation, replacing the old in the same `up`. The new worker takes the slot the old one releases on drain (lossless: the slot retains the WAL position, within `max_slot_wal_keep_size`). | Worker gap during replacement. |
| **singleton host** (`singleVM`) | the backend VM when it runs a stop-first worker in-process | start-first with LB overlap: the old VM serves until the new one passes its gate. PostgreSQL lets one session hold the replication slot and pg-boss claims each cron period once, so the new process's cdc and jobs wait until the old VM is gone; the rollout reaps it right after promotion, `--defer-reap` or not ([tasks/rollout-plans.ts](../infra/tasks/rollout-plans.ts) marks the plan `singletonHost`). | None for HTTP. Realtime events pause from cutover until the slot moves (the reap plus up to a minute); activities are still written. |

### Runtime secret delivery

Runtime secrets reach a VM through `/opt/app/.env.runtime`, a docker-compose `env_file` the boot runner writes from Secret Manager at boot.

- **The Pulumi state holds no password.** The database roles, their passwords and privileges, and the connection strings are made by the operator task [ensure-database.ts](../infra/tasks/ensure-database.ts) through the database API, after each apply and at setup. A role's password is kept in `/<slug>-<mode>/engine/db-password-<role>`, which only the operator reads; a stack whose roles the program made keeps its passwords, recovered from its connection strings. Every consumer's copy of a connection string is rewritten when the endpoint moves.
- **The Pulumi state holds no generated value.** A generated secret (a cookie secret, a token key) and one derived from another (the Yjs relay's public key) are made by the operator task [ensure-secrets.ts](../infra/tasks/ensure-secrets.ts) straight into Secret Manager, after each apply. A value that exists in any consumer's copy is kept and given to copies without one; rotating one is its own action. The program declares their containers only.
- **A deploy reads no secret of the app's.** Values are made and copied by an apply, on the operator key; secret containers are privileged resources, so a secret added to the registry reaches the stack through **Review & apply changes**. The deploy checks from metadata only that every required copy a machine reads holds a version ("Verify runtime secrets are deliverable"). The one value of the app's it reads is the telemetry ingest key, from its copy in `/<slug>-<mode>/deploy/`: setting the key in **Manage runtime secrets**, and every apply, keep that copy equal to the services' copies.

- **Every secret value must be a single line** (an `env_file` is line-based). Store multi-line values such as a PEM certificate **base64-encoded** and decode them in the consuming service, as `DATABASE_SSL_CA` does (encoded by the postgres store in [resources/stores/postgres-managed.ts](../infra/resources/stores/postgres-managed.ts), decoded in the db clients). The rule lives in [lib/utils/env-file.ts](../infra/lib/utils/env-file.ts): **Manage runtime secrets** refuses a value that breaks it, and the boot runner checks it again.
- An undeliverable `required` secret fails hydration and blocks boot, rather than crash-looping behind a 502.
- A process cannot read a mode-bound secret unless its `MODE` is configured to receive it; `modeSecret()` refuses the read otherwise.

### Certificate issuance and recovery

The load balancer, its DNS records and its certificates are made by the setup's first apply, before any machine, and change only in an apply: a deploy moves the pools' servers and nothing else of the load balancer, so enabling a routed service takes an apply first. Certificate issuance waits for the new DNS record to propagate ([dns-cert-gates.ts](../infra/resources/dns-cert-gates.ts)), and every apply first runs [repair-certs.ts](../infra/tasks/repair-certs.ts) to clear terminally errored certificates, which its `up` then makes anew. Manual run: `pnpm --filter infra repair-certs --stack <stack>`.

## Configuration

All tunable infra config lives in committed, type-checked files under [config/](../infra/config). Edit and deploy. Each field is a single value or a per-mode map (`{ production: …, staging: … }`).

| File | Owns | Applied by |
| --- | --- | --- |
| [config/services.config.ts](../infra/config/services.config.ts) | Per-service VM size (`instanceType`, required), replacement strategy, drain policy, LB routing, env. Which services exist comes from `appConfig.services.<name>.enabled` | routine CI deploy |
| [config/general.config.ts](../infra/config/general.config.ts) | DB node type & volume, asset retention | CLI **Review & apply changes** (the database and the buckets' lifecycle rules are privileged) |
| [config/runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts) | Which services receive each runtime secret | CLI **Review & apply changes** (secret containers and values are privileged) |

## Changing infrastructure

Most config changes ship through a normal CI deploy, including toggling `appConfig.services.<slug>.enabled` for a service without a load balancer route (a routed one takes an apply first). **Privileged** resources (database, VPC, private network, buckets and their policies, secret containers, DNS records, the load balancer but its pools' servers, the main job's definition) are changed with your operator key: `pnpm infra` → **Review & apply changes** (or `pnpm infra apply`). The machines' IAM applications and policies are no part of it: they are written at Owner moments ([Machine policies](#machine-policies)). The apply:

1. Asks for the operator key, unless this run already has it, and fetches the passphrase with it. A stack whose bucket policies were written before the operator was admitted lets it in first ([The retired admin application](#the-retired-admin-application)). Resources the program no longer declares but that stay live (machine policies, database roles, generated secret values) are taken out of the Pulumi state under the stack lock, a state-only edit, so the plan never shows them as deleted. Then shows the plan (`pulumi preview --diff --refresh`) with the operator key and asks once whether to apply it. Nothing is locked or changed up to here, so answering no is a read-only look. The plan reads live state first, so drift made outside Pulumi shows up; a deploy stops while any privileged change in it is pending. A registry service whose IAM application does not exist yet is planned with an application id that is known after the apply, under a warning that names the application.
2. On a yes, runs on the operator key ([Operator key](#operator-key)): it reaches the Scaleway provider via `SCW_*` env and the state side (login, lock, `up`) as `<access key>@<project id>`, and is never written to stack config. The operator key writes no IAM: an identity that differs from the declared ones (an application the service registry needs, a machine or deploy policy, a standing machine key) stops the apply before its `up`, with the list, and points at **Update identities**. An app without an operator application stops here and names **Set up operator key**.
3. Takes the stack lease (renewed while the run lasts, released on Ctrl-C; a lock left by a dead run lapses within minutes and the CLI waits for that), and reconciles the rollout pointers from live state.
4. Checks that the Pulumi state and the rollout pointers are the ones the plan was made on. When a deploy landed in between, or step 3 corrected a pointer, it shows the plan as it stands now and asks again.
5. Runs `pulumi up --refresh`, so the `up` corrects the same drift the plan showed, without setting `bootstrap:computeDeferred`: the running VMs and LB stay in place.
6. Verifies the result live: every VM, boot and CI principal holds exactly the declared grant, with the exact secret condition and project scope, and the declared database privileges exist. Pulumi reporting an update is not proof (one update was recorded in state while Scaleway kept the old rule), so a mismatch fails the run. `pnpm infra --debug-provider` keeps the engine and provider log of the `up` under `infra/.debug/` for such a case.
`pnpm infra preview` is step 1 without the question: for a script, or a look that must never reach an apply. The organization id comes from `SCW_ORGANIZATION_ID` in `backend/.env`.

The same preview runs as a **preflight**: first thing in every deploy, and as the `infra-preflight` job on the release PR against the production Environment. It names any pending privileged change (a database privilege, the VPC) with the Apply command above, so an owed Apply blocks the release PR instead of failing the production deploy after the images have built.

Every pull request also gets the `privileged-changes` check, which needs no key: the base and the head each render, under mocks, the identities and the privileged resources they declare for every environment with a stack file, and the job summary names what merging owes before the next deploy: **Update identities** for an application or a policy that is new, gone or changed, an apply for a privileged resource that is. It passes either way. It reads code only, so drift made outside Pulumi shows in the plan of an apply and not here.

**Deploy right after an Apply that removes a secret.** The running VMs keep the previous release until the next deploy replaces them. A VM boots from the secret list of its own generation and fails the boot on a `required` secret it can no longer read, so when an Apply deletes a runtime secret, or narrows which secrets a VM key reads, an old VM that reboots before the deploy stays down until the deploy replaces it. Run the deploy right after such an Apply. A deployment that serves users keeps the old secret and the old consumer lists for one release, and removes them in the next.

### Machine policies

The machines' IAM applications and their policies follow the **service registry** ([config/services.config.ts](../infra/config/services.config.ts)), not the enabled set: every registry service has an application and a policy that reads its own folder, wherever it runs. A machine that carries several services, such as the `singleVM` host, receives one key per service, and each service's copies are read with its own key. Toggling `enabled` or `singleVM` therefore changes no identity. They are IAM, so neither the Pulumi program nor the operator key writes them: the setup writes them at its Owner moment, and **Update identities** (`pnpm infra identity`) writes them after a change to the registry. A change to a runtime secret's consumers writes none: each consumer keeps its own copy in its own folder, which its policy names already. Values that lived in a shared folder before are moved into the copies by the first apply or deploy, and the shared container is deleted. It reads what differs first, with the observer key, and asks for an Owner API key only when something has to change. Until then the next deploy stops at "Verify identity grants". A registry service that is not enabled keeps its application and its standing key, which no deploy hands over. The deploy's "Stage machine keys" step stops when any identity holds a key besides its standing one; **Update identities** deletes it.

## Fresh installation

`pnpm infra` launches the CLI ([cli/infra-cli.ts](../infra/cli/infra-cli.ts)). Without a local `Pulumi.<stack>.yaml` it runs the install wizard. On an existing stack it opens one menu of eight rows; a row that cannot run now stays listed with the reason. Esc steps back, Esc or `q` on the menu leaves, and after an action the menu returns (`--once` leaves instead). Every action also runs alone as `pnpm infra <action>`; `pnpm infra help` lists them. A fresh install defaults to **staging**. Production is the same wizard via `pnpm infra --mode production`. `--defaults` takes every optional default and prompts only for required inputs (Owner API key, admin email). The CLI has no unattended mode: an action that changes infrastructure needs a person at the prompt, and a run without a terminal stops at its first question. `pnpm --filter infra status` shows the current state and next action.

### 1. Prerequisites

1. A domain, set as `appConfig.domain`, registered as external at https://console.scaleway.com/domains/external.
2. The Pulumi CLI, at least at the version of the `@pulumi/pulumi` package in `infra/package.json` (CI installs exactly that version, and `pnpm infra` warns when yours is older):

   ```bash
   brew install pulumi/tap/pulumi
   ```

3. GitHub CLI (recommended), authenticated with `gh auth login`, so the wizard can set the GitHub Environment secrets.
4. Docker with buildx (recommended), so the wizard can run the first deploy locally.
5. A Scaleway project per environment (optional): without `SCW_PROJECT_ID` in `infra/.env.<mode>`, the wizard picks or creates one (named after that environment's slug) and writes the id there. Every environment has a project of its own; the wizard does not offer the project of another environment.

<a id="2-generate-a-bootstrap-api-key"></a>

### 2. Your Owner API key

1. Easiest: as an organization Owner, generate an [API key for your user](https://console.scaleway.com/iam/users) (User menu → API keys → Generate). Give it an expiry when it is only for this setup.
2. Stricter: create an Application in [IAM → Applications](https://console.scaleway.com/iam/applications) with **ProjectManager + IAMManager** on the organization, and generate an API key for it.
3. Keep project ID and organization ID in your password manager. The key itself is for this setup only: the wizard offers to revoke it when the Owner moment ends, and everything after it runs on the operator key ([Operator key](#operator-key)).

### 3. Run the infra CLI

```bash
pnpm infra
```

The first setup has two parts. The **Owner moment** writes IAM and nothing else, with the Owner API key you paste:

1. Picks or creates the Scaleway project (prerequisite 5).
2. Creates the machine identities (one application per registry service, the boot fetcher and the builder) and writes their policies ([Machine policies](#machine-policies)).
3. Creates the CI deploy application with its key, and sets it on the GitHub Environment (if `gh` is authenticated).
4. Makes sure the app's operator reaches this environment: an app without an operator gets it created (you give the dedicated address, and the key is shown once: store it); an app that has one gets this environment's project added to its policy, and its key keeps working ([Operator key](#operator-key)).
5. Does the same for the app's observer, with the operator's address list, and writes its key to `infra/.env.<mode>` (`SCW_OBSERVER_*`) on this machine.
6. Offers to **revoke the Owner API key you pasted**. Nothing after this needs it.

The **operator part** runs on the operator key: the one just created, or the one you paste.

1. Generates the Pulumi passphrase and stores it in Secret Manager, so later runs fetch it with the operator key (set `PULUMI_CONFIG_PASSPHRASE` beforehand to supply your own).
2. Asks for the admin email and, with it, the mail key.
3. Creates state storage and initializes Pulumi.
4. Sets the passphrase on the GitHub Environment.
5. Optionally runs the first `pulumi up` (registry, database, network, and the load balancer with its DNS records and certificates and empty pools, but no machine yet) and seeds the admin email.
6. Offers the **first deploy** (the CI command with `--build`, using the new CI deploy key). Accepting ends with a live app. Declining leaves it to CI (step 4).

A second environment of the same app runs the same two parts: its Owner moment adds the environment to the operator's reach, and its operator part asks for the operator key you stored.

### 4. Commit and push

1. Commit `infra/Pulumi.<mode>.yaml` and push.
2. CI needs the GitHub Environment secrets (the local wizard does not). If `gh` was authenticated, setup already set them on the stack's Environment. Otherwise add them under **Settings → Environments → `<mode>` → Environment secrets** (environment-scoped, not repo-level):

| Secret | Value |
| --- | --- |
| `SCW_ACCESS_KEY` | CI deploy key access key |
| `SCW_SECRET_KEY` | CI deploy key secret key |
| `PULUMI_CONFIG_PASSPHRASE` | Pulumi passphrase (generated at setup) |
| `SCW_PROJECT_ID` | Scaleway project ID |
| `SCW_ORGANIZATION_ID` | Scaleway organization ID |

<a id="5-revoke-the-bootstrap-key"></a>

### 5. Revoke the setup key

If you pasted a key created for this setup, revoke it now. The Owner moment's last step covers it. If you declined or it failed:

1. Delete the key at [IAM → API Keys](https://console.scaleway.com/iam/api-keys).
2. Optionally delete the temporary application.

Day-2 privileged runs take the operator key, never this one.

### 6. Sign in as the first admin

The one-shot `backend-release` companion (the migrate step on every new generation) seeds a single admin when the users table is empty ([backend/src/main.migrate.ts](../backend/src/main.migrate.ts), idempotent), from the **required** `admin-email` runtime secret (`ADMIN_EMAIL`) the wizard prompts for. The deploy preflight refuses to roll while it is missing.

1. Open the app and request a magic link for the admin email.
2. Sign in. If magic links do not arrive, seed the Brevo API key (or your email provider's) via **Manage runtime secrets**.

## Architecture reference

Resource modules, layer order, and the infra file layout: [infra/README.md](../infra/README.md).

## Advanced operations

### GeoIP data

Sign-ins resolve the client IP to a country and network (DB-IP Lite, CC BY 4.0) for the sessions list and the new sign-in notice. The image ships no data: each API process downloads both databases from the `geoip/` prefix of the public bucket at boot and re-checks daily with a conditional GET, so a refresh never needs a release. In development the prefix is the shared template bucket, so local sign-ins show a country out of the box (a sample public address stands in for loopback, `GEOIP_DEV_SAMPLE_IP`).

Three things publish to the prefix, all the same task ([infra/tasks/geoip-refresh.ts](../infra/tasks/geoip-refresh.ts)): the deploy pipeline when the data is missing or older than 35 days, the monthly [GeoIP refresh](../.github/workflows/geoip-refresh.yml) workflow, and by hand:

```bash
pnpm infra geoip-refresh
```

The task downloads from DB-IP (falling back to the previous month when the new one is not published yet), verifies every archive is a real MMDB and uploads the databases before a `manifest.json` that records the month. A failed download or a bucket problem costs only the country line; sign-ins never depend on it. `GEOIP_SOURCE_URL=off` disables the refresh, another prefix or bucket overrides the source.

### Seed the admin by hand

When the magic link for the first admin never arrives and the runtime secrets are right, seed directly.

**Fallback: seed by hand** via the serial console (backend instance in the [Scaleway console](https://console.scaleway.com/instance/servers) → **Console**, root password on the instance page), using the bundled seed runner ([backend/scripts/seeds-bundle.ts](../backend/scripts/seeds-bundle.ts)) with the `backend-release` image and its `.env`/`.env.runtime` (`DATABASE_ADMIN_URL`):

```bash
cd /opt/app
docker compose --profile backend run --rm -e ADMIN_EMAIL=you@example.com backend-release node dist/seeds-bundle.js init
```

**Alternative: break-glass from your laptop.** Briefly exposes the DB (ACL-locked to your IP), so prefer the serial console. Both flows serve any operator task against the live database. For staging, **Open public DB access** → **Seed database** (`pnpm infra db-seed`) opens, seeds, and closes in one go (never on production).

1. Expose the DB (needs your operator key). The ACL defaults to `<your.ip>/32` (IPv4 only, open ranges refused) and the admin connection string is printed:

   The CLI refuses native IPv6 and `/0` entries. Entries wider than `/24` require
   `infra:dbPublicAclAllowWide=true`, and all entries together may cover at most half of IPv4.
   IPv4-mapped IPv6 addresses are normalized to the IPv4 range they name.

   ```bash
   pnpm infra db-open
   ```

2. Seed locally:

   ```bash
   ADMIN_EMAIL=you@example.com DATABASE_ADMIN_URL='<printed connection string>' pnpm --filter backend seed:production init
   ```

3. **Close the endpoint again** (and revoke a pasted key). A deploy does not close it. The close deletes the public endpoint over the RDB API and re-reads the instance until it has none; the menu offers it whenever the live instance has a public endpoint, and `pnpm infra status` warns about one (`db.publicEndpoint`):

   ```bash
   pnpm infra db-close
   ```

### Reset the database

Rebuilds the app's logical database from migrations plus the admin seed. **Pre-production only, or with services deliberately quiesced: a hard outage.** `pnpm infra` → **Reset database** takes a backup (aborting unless it reports ready), deletes and recreates the logical database over the Scaleway API with your operator key, and re-grants both roles. It never exposes the database and never runs `pulumi up`. Then, on the serial console, re-run the migrate companion, which also seeds the admin from the `ADMIN_EMAIL` runtime secret while the users table is empty ([main.migrate.ts](../backend/src/main.migrate.ts)):

```bash
cd /opt/app
docker compose --profile backend run --rm backend-release
```

Verify: `curl https://<your-app>/api/health?depth=full` reports every component `healthy`. A recreated or restored database has no replication slot: the CDC worker makes one, rebuilds its sync books and every connected client refetches (a `sync_incidents` row with reason `lost_slot`).

- **Nothing but you stops this.** Scaleway's API deletes a live database with connected clients and an active replication slot. The typed `<database>@<instance>` confirmation is the only guard.
- **Re-granting is mandatory, and the task owns it.** Deleting a database drops its Scaleway privileges. Neither a recreate nor a backup restore brings them back (`pg_dump` carries table ACLs, not database-level ones), so without it `CONNECT` is absent and the app reports `database_unreachable`.
- If the task fails after the delete, it prints the exact `scw rdb backup restore` command plus the two `privilege set` calls a restore does not perform.

### Restore a backup

A backup holds the accounts deleted after it was taken, and a deletion someone asked for has to hold on the restored database too. A deleted account leaves its `actors` row behind, so the live database lists them. Before restoring, save that list:

```sql
SELECT a.id FROM actors a LEFT JOIN users u ON u.id = a.id WHERE a.kind = 'user' AND u.id IS NULL;
```

Restore and re-grant both roles as above, then delete those accounts again. Their sessions go with the `users` rows:

```sql
DELETE FROM oidc_payloads WHERE account_id = ANY($1);
DELETE FROM users WHERE id = ANY($1);
UPDATE actors SET last_seen_at = NULL, last_sign_in_at = NULL WHERE id = ANY($1);
```

### Rotation

Two acts, each recorded in the control object with when and by whom, and `pnpm infra` opens with the last of each kind ("never" where that is so). No date is a deadline: nothing fails by age, and `status` lists every key's age. A rotation raises a counter that is part of every new generation's identity, so the next deploy replaces every machine, also on the same release, and none keeps a key or a value from before. After a compromise, rotate keys first.

**Rotate secrets** (`pnpm infra rotate-secrets`, operator key): a fresh password for every database role, set on the live role through the database API, and a fresh value for every generated secret marked `rotatable` in [runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts), every consumer's copy rewritten. A key that encrypts or hashes stored data (`data-encryption-key`, `pii-hash-secret`) is not marked: a new value would leave that data unreadable or unmatched, so it needs a rotation in the app, with both keys at hand. The running machines keep the old values until the next deploy replaces them, and the database refuses the new connections they open with the old passwords: deploy right after. Third-party keys are pasted anew in **Manage runtime secrets**, the passphrase in **Rotate passphrase**.

### Key rotation

1. Have your operator key at hand.
2. `pnpm infra` → **Rotate keys & secrets** → **Rotate keys**: mints a fresh `<slug>-<mode>-ci-deploy` key, copies it into the engine folder for the [main job](#the-main-job), and, if `gh` is authenticated, pushes it to the stack's GitHub Environment as `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`. It also replaces the observer key (rewritten in every `infra/.env.<mode>` on this machine that holds it; a copy on another machine stops working) and every standing machine key, deleting the old ones. No key is written to stack config.
3. The rotation is recorded with your operator key. Deploy. The running machines booted with the old machine keys, which are deleted now: a reboot before the next deploy cannot hydrate, and the backend's presigned URLs stop working until then. No commit is needed.
4. Revoke a pasted key in the Scaleway console.

To put the observer key on another machine, run **Update identities** there with your Owner API key: it makes a key of the observer for that machine, and the keys elsewhere keep working.

### The retired admin application

Stacks set up before the observer have a `<slug>-<mode>-admin` application, and their bucket policies were written before the operator was admitted: they name the admin application and shut the operator out. A bucket policy shuts out every principal it does not name, the organization Owner included, so only the admin application can rewrite them. The first apply (or setup resume, unlock, teardown) on such a stack reads the admin key from its custody secret at `/<slug>-<mode>/engine/admin-key` with the operator key, and rewrites the policies that lack the operator in one targeted `pulumi up` that keeps the admin's statements; the apply itself then drops them. Afterwards **Update identities** deletes the admin application with its keys and its custody secret. It keeps both while the state bucket does not admit the observer yet, as that is how it knows the policies were rewritten.

### Operator key

`pnpm infra` → **Rotate keys & secrets** → **Set up operator key** (`pnpm infra operator-key`), run once per app with your Owner API key (a first setup runs it for you), and again when the address changes. A new environment needs no new key, as its setup adds the environment to the operator's policy in place. The action:

1. Asks for the dedicated IPv4 address or addresses the key works from; the default is the address this machine reaches the internet with. Ranges wider than `/24` are refused, as for the database allowlist.
2. Creates the `<app>-operator` application with a policy of up to three rules: every product in the project of each environment this machine knows (the ones whose setup wrote a project to `infra/.env.<mode>`), DNS in the serving zone's project when that is none of them, and IAM read in the organization. Each rule carries the same address condition. The app's name is production's slug, the one in `shared/config/config.default.ts`, so staging (`cella-staging`) and production (`cella`) share `cella-operator`.
3. Shows the new key once and waits until you confirm it is in your password manager.
4. Tries the key from this machine until Scaleway accepts it. A new policy takes about a minute to apply, and single APIs follow later still.

From another address Scaleway refuses the key: IAM, Secret Manager and Object Storage answer with an error, while the database and Instances APIs answer a list with nothing in it. A stack that looks empty from a new address is therefore the address, not the stack.

Running the action again replaces the policy and every earlier key. It needs your Owner API key each time: the operator key writes no IAM, its own policy included. Keep the Owner account for this and for recovery, with MFA and no API key lying around.

**A new dedicated address** is set the same way, with **Set up operator key**, or by editing the address in the policy's rules in the console. Scaleway applies a policy change within a few minutes, one API after the other, so an address that was removed can still work for a short while.

**How a session is unlocked.** The first action that changes something, or that needs the passphrase, asks for the operator key, access key and secret key. The CLI proves it by asking IAM who bears it, with the key itself: the answer has to be the operator application. It keeps the pair in memory until you quit, and every action of the run works with that key. When Scaleway refuses the key, the CLI says why: a secret key Scaleway does not know, or an address off the list, with this machine's address beside the ones the policy names.

### Repository read key

The builder fetches a release's commit from the repository the root `package.json` names. A repository anyone may read needs nothing; a private one needs a read-only key in each environment, set before its first deploy: `pnpm infra repository-key`, on your operator key. Make a fine-grained GitHub token for that repository only, with **Contents: read** and nothing else, and an expiry. The action checks that the repository answers to it, then stores it in the environment's deploy folder (`/<slug>-<mode>/deploy/repository-read-key`). The deploy hands it to the builder in its read-once bundle, and the builder sends it as a header with its one fetch, so it is in no URL and no file the build sees. Run the action again to replace it before it expires; an empty answer removes it. A build that fails at its fetch names the action. The deploy pipeline finds a target with its own job's read token, which needs no key of yours.

### Passphrase rotation

`pnpm infra` → **Rotate keys & secrets** → **Rotate passphrase**:

1. Verifies the current passphrase and generates a new one, shown once. Store it first.
2. Re-encrypts the stack (`pulumi stack change-secrets-provider passphrase` rewrites the state object and `Pulumi.<stack>.yaml` with a fresh `encryptionsalt`) under the stack lock, and verifies the rewritten file decrypts with the new passphrase.
3. Syncs the new `PULUMI_CONFIG_PASSPHRASE` to the GitHub Environment (when `gh` is authenticated).
4. Reminds you to commit `infra/Pulumi.<stack>.yaml`.

> Losing the current passphrase means existing secret outputs cannot be decrypted. There is no recovery. Actions secrets are write-only, so the GitHub copy keeps CI working but can never be viewed. Keep your password-manager copy current.

### Teardown

`pnpm infra` → **Tear down stack** deletes every resource to stop billing: it requires typing `<slug>-<mode>`, runs `pulumi destroy --refresh` under the stack lock with your operator key, then optionally deletes the stack's IAM principals, for which it asks for an Owner API key ([API keys](#credentials)). The app's operator application stays: it serves the other environments. Production resources marked `protect: true` (frontend/private buckets, database) are refused unless protection is lifted in code first. Left in place on purpose: the versioned state bucket, operator secret values, and GitHub Environment secrets.

> **Clean slate** below is not a teardown: it resets stack tracking to set up a still-running stack again. Live resources stay.

<a id="clean-slate"></a>

### Clean slate (start over from scratch)

1. `rm infra/Pulumi.<stack>.yaml`
2. (optional) Scaleway console → Object Storage → delete bucket `<slug>-pulumi-state` (names stay reserved for several hours).
3. (optional) Revoke a pasted setup key in the Scaleway console.
4. (optional) Delete IAM application `<slug>-<mode>-ci-deploy` and its policy.
5. (optional) Remove `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` from the stack's GitHub Environment.
6. Re-run: `pnpm infra`
