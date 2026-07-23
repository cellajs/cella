# Infra CLI

This document covers the infra package: infrastructure as code and the CLI that deploy a Cella app to European cloud infrastructure, mostly [Scaleway](https://www.scaleway.com/).

### TL;DR

Publishing a release starts an automatic deployment. It creates new servers for that exact version,
checks them, moves traffic without downtime, and removes the old servers.
[Pulumi](https://www.pulumi.com/) manages the cloud resources. GitHub Actions runs the deployment.
Separate credentials are used for initial setup, automated deployment, and running servers, so
each stage has only the permissions it needs.

## Overview

The infrastructure is built around three principles:

1. **Create-then-replace.** A release and an infra change are the same operation: every deploy bakes the image SHA into a _new_ VM generation's cloud-init, brings it up (cutover), then retires the old one.
2. **Descending-privilege credentials.** Three keys, each creating the next (bootstrap → CI deploy → VM reader), so no privileged key ever lives on your laptop. CI only holds what it needs.
3. **DRY config.** IaC is great for inheriting config to keep configuration DRY. See also [config files](#configuration).

The key resources and how traffic flows between them:

```
                             Users / browsers
                                     │  https://<domain>
                                     ▼
            ┌─────────────────────────────────────────────────┐
            │             Scaleway Load Balancer              │  TLS termination,
            │  default    →  frontend VM                      │  one public IP
            │  /api       →  backend VM                       │
            │  /yjs, /mcp →  worker VMs                       │
 ┌──────────┤                                                 ├────────────┐
 │          └───────┬────────────────┬──────────────────┬─────┘            │
 │ Private network  │                │                  │  plain HTTP to   │
 │ (VPC)            │                │                  │  VM private IPs  │
 │                  ▼                ▼                  ▼                  │
 │           ┌─────────────┐  ┌─────────────┐ ┌──────────────────────────┐ │
 │           │ frontend VM │  │ backend VM  │ │  workers: cdc, yjs,      │ │
 │           │   (Caddy)   │  │             │ │  mcp (run on backend     │ │
 │           │             │  │             │ │  VM when singleVm)       │ │
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

- **Load balancer:** the single public entrypoint, and **dual-homed**: a public IP terminates TLS on one side, a private-network attachment forwards plain HTTP to VM private IPs on the other. The frontend (SPA proxy) is the default backend; backend, yjs and mcp are reached on the same app origin via registry-declared `lbPathBegin` prefixes (`/api`, `/yjs`, `/mcp`). The LB never rewrites paths, so each service serves itself under its prefix. No shipped service is host-routed after the same-origin migration; host routes remain only for forks that add them.
- **Private network (VPC):** VMs and db connect over private IPs. Only the LB accepts inbound public traffic — each VM keeps a public IP for egress (image pulls), but drops all inbound, including SSH.
- **Frontend:** a Caddy VM behind the LB that reverse-proxies the SPA bucket over its public S3 endpoint, adding security headers/CSP and the SPA deep-link fallback.
- **Backend VM:** the critical API path; replaced one generation at a time with LB overlap.
- **Worker VMs:** `cdc`, `yjs`, `mcp` each run on their own VM when enabled and `singleVm` is disabled; with `singleVm` on they are co-hosted on the backend VM and no separate worker VMs exist. `cdc` takes no LB route in either mode — it is internal-only.
- **Database:** managed PostgreSQL reachable only from inside the private network (a break-glass toggle can temporarily expose it, see [Changing infrastructure](#changing-infrastructure)).
- **Buckets:** object storage sits outside the VPC and is reached over public S3 endpoints: browsers read the public upload bucket directly and use presigned URLs for the private one, the frontend Caddy proxies the SPA bucket, and the backend talks to S3 server-side.

## Deploy flow

The deployment lifecycle when you push to `main`:

```
Developer pushes to main
        ↓
GitHub Actions builds images
        ↓
Runs pulumi up
        ↓
Provisions new VM generation(s)
        ↓
Verifies public services serve the expected SHA
        ↓
Retires old generation(s) through Pulumi-managed replacement
        ↓
Load balancer keeps serving traffic
```

At runtime, the load balancer targets the host port published by the service's compose profile directly. The `frontend` service is itself a Caddy proxy image that serves the SPA bucket through the same VM/LB path as other services.

```
Scaleway LB ──▶ service VM host port ──▶ service container
```

The primary rollout service (the one that owns migrations) is verified first, then the rest in parallel. `cdc` has no public health endpoint; its replacement is confirmed indirectly by the primary public service coming up healthy.

**Rollback:** the old generation is reaped once the new one is healthy; nothing is left running for two generations per service. To roll back, commit a revert and redeploy: it follows the exact same forward path and recreates **every** service (including cdc, which is replaced in place and never retained), reusing the cached generation because the `genId` is content-addressed.

## Credentials

The security model is defined by exactly three Scaleway API keys, in strictly descending privilege, each in a different store. Each key creates or provisions the next:

```
Bootstrap key      (broad, short-lived; in your password manager only)
    │ creates
    ▼
CI deploy key      (project-scoped write; in GitHub Environment)
    │ provisions
    ▼
VM reader key      (read-only; baked into each VM)
    │ reads
    ▼
runtime secrets + images on VM
```

| Key | Permissions | Lifetime | Where stored |
| --- | --- | --- | --- |
| **Bootstrap key** | Owner (via Personal API Key) **or** ProjectManager + IAMManager on a dedicated IAM application | Minutes: revoked immediately after each use (initial bootstrap or manual rotation). Also required for any `pulumi up` that touches bootstrap-owned modules (DB, VPC, private network). | Password manager only, never on disk |
| **CI deploy key** (`<slug>-ci-deploy`) | Write on compute / LB / edge / secrets / object storage / registry; **read-only** on VPC / private network / RDB (those are bootstrap-owned). Project-scoped, plus DNS at org scope. | Long-lived; rotate manually by re-running the CLI's **Rotate keys** action (see [Key rotation](#key-rotation)) | The `production` GitHub Environment secrets `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` (environment-scoped, not repo-scoped). The Scaleway provider authenticates from those env vars. |
| **VM reader key** (`<slug>-vm-reader`) | Read-only registry / Secret Manager (incl. `SecretManagerSecretAccess` for decrypt-read). Just enough for a VM to pull images and hydrate `/opt/app/.env.runtime`. | Long-lived; rotates with the CI key | Seeded into Scaleway Secret Manager at bootstrap (the `vm-reader-key` secret), read back at `pulumi up`, and baked into VM cloud-init. Not in stack config. |

A fourth secret sits outside this chain: the **Pulumi passphrase**, which encrypts the stack's secret outputs in the state bucket. It is not an IAM identity: the CLI generates it at bootstrap and syncs it to the GitHub Environment; your only job is storing it in your password manager when shown (see [Passphrase rotation](#passphrase-rotation)).

## CI deploys

The workflow at [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) runs:

- **On push to `main`**: builds images, uploads frontend, runs `pulumi up`, verifies deployment.
- **On manual dispatch**: same, against chosen environment (`staging` or `production`).

CI builds the image, records the release SHA as the rollout INTENT in the S3 control object, and [tasks/deploy-service.ts](tasks/deploy-service.ts) drives a **new VM generation** (`vm-<svc>-<genId>`) with that SHA baked into its cloud-init. The `genId` is **content-addressed** (a hash of the release SHA plus the generation's static config), so re-running a deploy reuses the same generation (a true no-op) and a manual `pulumi up` can never fork identity. For LB-backed services the reconciler expands the LB backend to `[old,new]`, waits until the public `/health` can serve the expected `X-App-Version`, then contracts to `[new]`; the promoted new generation serves and the old one is reaped once it is healthy (rollback = revert commit + redeploy). See [rollout strategies](#rollout-strategies) for the model.

To trigger a staging deploy: GitHub → Actions → Deploy → Run workflow → select `staging`.

To gate production behind manual approval, configure a [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) named `production` with required reviewers. The workflow already targets it.

## Rollout strategies

Every deploy is a **create-then-replace**: the image SHA is baked into a new VM generation's cloud-init, so a release and an infra change flow through one path. Each service declares its replacement strategy in the fork-owned registry ([config/services.config.ts](config/services.config.ts)).

| `replacementStrategy` | Services | How |
| --- | --- | --- |
| **lb-overlap** | backend, frontend, yjs, mcp | Record the SHA as `pendingSha`; the Pulumi program materialises the content-addressed pending generation alongside the active one. [tasks/cutover.ts](tasks/cutover.ts) then runs a **level-triggered reconciler**: it reads the live LB server list and drives it toward the desired state with idempotent Scaleway `SetBackendServers` calls: expand to `[old,new]`, health/version-gate through the public LB, contract to `[new]`, drain. It never silently skips the corrective call, so an empty/stale pool (or a same-generation redeploy) is repaired rather than assumed correct. The new generation is promoted to `active` and the old one is reaped by the deploy-service's own final `pulumi up` once the cutover is healthy. No generation is retained, so a deploy never runs two VMs per service. |
| **exclusive** | cdc | No LB overlap: cdc holds one Postgres replication slot. The Pulumi program materialises only the new generation (the old one is replaced in the same `up`); the new worker contends for the slot the old one releases on drain (handoff is lossless: the slot retains the WAL position). |

**`drainPolicy`** tunes how the old generation leaves the LB: `requests` (HTTP; `onMarkedDownAction: none`, in-flight requests finish) for backend/frontend/mcp, or `reconnect` (WebSocket; sessions shed, clients re-dial and resync from durable state) for yjs.

[tasks/cutover.ts](tasks/cutover.ts) contains the pure, unit-tested **level-triggered** reconciler core for the explicit LB-overlap path: it reads the live server list and drives it toward the desired state (expand→health→contract→drain) with idempotent `SetBackendServers` calls, never silently skipping the corrective call. [tasks/deploy-service.ts](tasks/deploy-service.ts) wraps it with Pulumi bookends: record the SHA as `pendingSha` in the **S3 control object** (`control/<stack>.json` in the state bucket, the source of truth the Pulumi program reads), `pulumi up` to materialise the content-addressed generation, run the reconciler, then `promote` it to `active` (the old generation is reaped once the new one is healthy). Internal consumers reach a service over the private network with `@{<svc>.privateIp}`, which resolves to that service's current generation IP baked in at deploy time. The rollout order (the stable service first, e.g. backend before cdc) means a consumer redeployed afterwards always binds the freshly promoted generation. A frontend **content** release is just an S3 upload (no VM cutover); only a Caddy/CSP/cloud-init change replaces the frontend VM.

### Runtime secret delivery

Runtime secrets reach a VM through `/opt/app/.env.runtime`, a docker-compose `env_file` that the on-VM boot agent writes from Secret Manager at boot. Because an `env_file` is line-based, **every secret value must be a single line**. Multi-line values (e.g. a PEM certificate) must be stored **base64-encoded** and decoded by the consuming service. This is what `DATABASE_SSL_CA` does (encoded in [resources/secrets.ts](resources/secrets.ts), decoded in the db clients). A `required` secret that can't be delivered fails the sync, which by design blocks the service from booting rather than letting it crash-loop behind a 502.

Two safeguards keep a runtime-secret change from causing the kind of full outage a mis-delivered secret would otherwise trigger. They were added after a multi-line secret (`DATABASE_SSL_CA`) bricked a backend rollout, and they sit alongside the single-line/base64 contract above:

1. **The secret _manifest_ is baked into the new generation's cloud-init.** The per-service manifest (the list of which secrets a VM hydrates; metadata only, never values) is built by Pulumi ([resources/compute.ts](resources/compute.ts)) and written into cloud-init. Because every deploy already replaces the VM, there is no out-of-band channel to maintain; the first-boot agent reads the manifest and hydrates `/opt/app/.env.runtime` before the app starts.
2. **Deliverability is preflighted in CI before rolling.** Right after `pulumi up`, and before any VM is rolled or replaced, the deploy asserts that every `required` secret can actually be hydrated the way a VM will (fetched from Secret Manager and single-line / decodable), failing loudly with the offending env vars instead of bricking the fleet ([tasks/assert-secrets-deliverable.ts](tasks/assert-secrets-deliverable.ts), wired into the `pulumi` job as **Verify runtime secrets are deliverable**, mirroring the existing **Verify VM reader IAM grant** preflight). The single-line rule itself lives in one place, [lib/env-file.ts](lib/env-file.ts), shared by the preflight and the on-VM boot agent that performs the hydration.

### Certificate issuance and recovery

A new service's DNS record must propagate before Scaleway requests its Let's Encrypt certificate. Otherwise ACME resolvers can see `NXDOMAIN`, leaving a terminally errored certificate that Scaleway does not retry. [`DnsPropagationGate`](resources/dns-cert-gates.ts) waits for public resolvers to return the load balancer IP before certificate creation; `CertReadyGate` then surfaces ACME failure details and delays frontend attachment until the certificate is ready. Both gates are create-only.

CI runs [`repair-certs.ts`](tasks/repair-certs.ts) before `pulumi up`. It removes terminally errored certificates from Pulumi state and then from Scaleway so the gated issuance pipeline can run again. State deletion happens first: a dependent frontend makes Pulumi refuse the deletion, which preserves TLS material still in use. A certificate deleted out of band is pruned from state only. Operators can run the same repair with `pnpm --filter infra repair-certs --stack <stack>`.

## Configuration

All tunable infra config lives in committed, type-checked files under [config/](config). Edit a value there and deploy. Each field is either a single value or a per-mode map (`{ production: …, staging: … }`).

**Common questions:**

- _Where do I change a VM size?_ → `instanceType` in [config/services.config.ts](config/services.config.ts) (applied by the next CI deploy).
- _Where do I change the database size?_ → DB node type & volume in [config/general.config.ts](config/general.config.ts) (bootstrap-owned RDB; apply via [Changing infrastructure](#changing-infrastructure)).

| File | Owns | Applied by |
| --- | --- | --- |
| [config/services.config.ts](config/services.config.ts) | Per-service VM size (`instanceType`, required), replacement strategy, drain policy, LB routing, env, feature flags | routine CI deploy |
| [config/general.config.ts](config/general.config.ts) | DB node type & volume, asset retention | DB fields via CLI **Apply infra change** (bootstrap-owned RDB); the rest via routine CI deploy |
| [config/runtime-secrets.config.ts](config/runtime-secrets.config.ts) | Which services receive each runtime secret | routine CI deploy |

What stays in Pulumi config (not committed fork data): the encryption salt, the transient DB public-endpoint break-glass toggle (`infra:dbPublicEndpoint` / `infra:dbPublicAcl`), and the bootstrap `computeDeferred` lifecycle marker. Per-service rollout state (generation + image SHA) lives in the **S3 control object** (`control/<stack>.json` in the state bucket), not in committed config: written by the deploy around each cutover and read by the Pulumi program at plan time. A conditional-write lock (`control/<stack>.lock.json`) prevents a CI deploy and an operator `apply` from mutating the same stack concurrently; clear a stale lock with the CLI **Unlock** action.

## Changing infrastructure

Most config changes ship through a normal CI deploy. But **bootstrap-owned** resources (the database, VPC, and private network) can only be mutated with a temporary bootstrap key.

To apply a bootstrap-owned change (e.g. resize the database), run the CLI (`pnpm infra`) and pick **Apply infra change**. The action:

1. Prompts for the Pulumi passphrase and a fresh bootstrap key (broad permissions, see [Generate a bootstrap API key](#2-generate-a-bootstrap-api-key)).
2. Supplies that key to the Scaleway provider via `SCW_*` env (it is never written to stack config).
3. Runs `pulumi up` against the already-bootstrapped stack. Compute stays up: unlike the fresh-provision flow, Apply infra change does **not** set the `bootstrap:computeDeferred` marker, so the running VMs/LB are left in place.
4. Reminds you to revoke the bootstrap key.

## Fresh installation

The interactive CLI ([cli/infra-cli.ts](cli/infra-cli.ts)) is launched with `pnpm infra`. It inspects the local `Pulumi.<stack>.yaml` to decide whether this is the start of a fresh installation or to manage an existing setup. On a fresh stack it skips the menu and runs a fresh install directly.

### 1. Prerequisites

- **A domain.** You need an external domain (set as `appConfig.domain`) set up through: https://console.scaleway.com/domains/external.
- **Pulumi.** Install the CLI:

  ```bash
  brew install pulumi/tap/pulumi
  ```

- **GitHub CLI** (recommended). If you want bootstrap to create the GitHub Environment and sync the CI deploy secrets automatically, install `gh` and authenticate it first with `gh auth login`.
- **Scaleway Project** Create a project (e.g. `cella-apps`) in the [Scaleway console](https://console.scaleway.com/). Note the **Project ID** and **Organization ID** and add them to your `backend/.env`.

### 2. Generate a bootstrap API key

This key is used _only_ during bootstrap and is revoked immediately after. It needs to create IAM applications and policies (i.e. `IAMManager` plus enough to read your project).

**Easiest path: Personal API Key.** If you're an Owner on the organization, just generate a [Personal API Key](https://console.scaleway.com/iam/users) (User menu → API keys → Generate). It inherits your Owner permissions, which is everything bootstrap needs. Delete it the moment bootstrap finishes.

**Stricter alternative: dedicated bootstrap application.** If you'd rather not use a personal key, create an Application in [IAM → Applications](https://console.scaleway.com/iam/applications) (e.g. `bootstrap`) with a policy granting **ProjectManager + IAMManager** on the organization, and generate an API key for it. More setup, same outcome.

Save the access key, secret key, project ID, and organization ID in your password manager for the duration of the bootstrap session only.

### 3. Run the infra CLI

```bash
pnpm infra
```

The CLI:

- Generates the Pulumi passphrase. **Store it when shown**; it is shown only once and unrecoverable if lost (set `PULUMI_CONFIG_PASSPHRASE` before running to supply your own)
- Creates state storage
- Initializes Pulumi
- Creates required credentials
- Configures GitHub (if available)
- Optionally runs the first pulumi up

### 4. Compute base image

Service VMs boot from Scaleway's stock **`docker`** marketplace image (Docker Engine + the Compose plugin, preinstalled and current), set as `compute.image` in [config/general.config.ts](config/general.config.ts) and passed straight to the instance. There is **no image bake**: the `cella-boot-agent` ships as a normal registry container ([agent/Dockerfile](agent/Dockerfile)) that CI builds and pushes per commit, and every VM `docker run`s it at first boot (mounting the host Docker socket) to bring its compose stack up. Cloud-init shrinks to a launcher that writes the boot plan, logs the host into the registry, and runs the agent container; the agent owns the boot state machine (compose/env files, runtime-secret hydration, image pull, migrate, app start).

Set `compute.image` to a literal image UUID only to **pin** a specific base image for rollback.

### 5. Commit and push

After the first local `pulumi up` finishes, commit the updated `infra/Pulumi.production.yaml` and push to `main`. CI will then build and push the Docker images, run `pulumi up` again, and bring the compute VMs up automatically.

The first local `pulumi up` does **not** depend on GitHub secrets, but the CI run after you push does. If they're missing, the CI step fails and the VMs will not come up.

If `gh` CLI was authenticated during bootstrap, it already set the GitHub Environment secrets it manages on `production`. Otherwise add them manually under **Settings → Environments → `production` → Environment secrets** (preferred, environment-scoped) rather than repo-level secrets:

| Secret | Value | Scope | Set by bootstrap? |
| --- | --- | --- | --- |
| `SCW_ACCESS_KEY` | CI deploy key access key | environment | ✓ if `gh` |
| `SCW_SECRET_KEY` | CI deploy key secret key | environment | ✓ if `gh` |
| `PULUMI_CONFIG_PASSPHRASE` | Pulumi passphrase (generated at bootstrap) | environment | ✓ if `gh` |
| `SCW_PROJECT_ID` | Scaleway project ID | environment | ✓ if `gh` |
| `SCW_ORGANIZATION_ID` | Scaleway organization ID | environment | ✓ if `gh` |

### 6. Revoke the bootstrap key

> **Do this immediately after bootstrap completes.**

1. Go to [IAM → API Keys](https://console.scaleway.com/iam/api-keys) and delete the bootstrap key.
2. Optionally delete the temporary bootstrap application too.

After bootstrap, only the long-lived deploy and VM keys should remain. From here on, **all routine deploys happen in CI**.

### 7. Create the first admin

A fresh production database has **no users**, so there is no way to sign in to the deployed app yet. CI deploys only run schema migrations (the one-shot `migrate` companion); they do **not** seed. You must create the first admin once, by hand.

The backend image ships a bundled, production-safe seed runner ([backend/scripts/seeds-bundle.ts](../backend/scripts/seeds-bundle.ts), the `seed:production` script). It applies migrations + DB roles and then inserts a single admin user (idempotent: it skips if the users table is already non-empty). The admin signs in via a magic link sent to `ADMIN_EMAIL`, so working outbound email and a mailbox you control are required.

**Recommended: run it on a VM via the serial console** (no DB exposure, uses the image already on the box):

1. After the first CI deploy has brought the compute VMs up, open a backend instance in the [Scaleway console](https://console.scaleway.com/instance/servers) → **Console** (serial console) and log in with the root password shown on the instance page.
2. Run the seed once, supplying the admin email:

   ```bash
   cd /opt/app
   docker compose --profile backend run --rm -e ADMIN_EMAIL=you@example.com migrate node dist/seeds-bundle.js init
   ```

   This reuses the `migrate` companion's image and `.env`/`.env.runtime` (which carry `DATABASE_ADMIN_URL`), overriding only the command to run the seed bundle.

3. Open the app, request a magic link for `you@example.com`, and sign in.

**Alternative: break-glass from your laptop.** If you'd rather not use the serial console, temporarily expose the database with the CLI, run the seed locally against `DATABASE_ADMIN_URL`, then close it again. This briefly exposes the DB (ACL-locked to your IP), so prefer the serial-console path:

1. Expose the DB, locked to your IP (needs a bootstrap key):

   ```bash
   pnpm infra   # → "Expose database publicly"
   ```

   It detects your public IP, defaults the ACL to `<your.ip>/32` (refusing open ranges), converges with a bootstrap key, and prints the admin connection string.

2. Run the seed locally against the printed connection string:

   ```bash
   ADMIN_EMAIL=you@example.com DATABASE_ADMIN_URL='<printed connection string>' pnpm --filter backend seed:production init
   ```

3. **Close the endpoint again**, then revoke the bootstrap key:

   ```bash
   pnpm infra   # → "Stop public DB exposure"
   ```

These two modes are general-purpose break-glass for any scoped operator task against the live database (data inspection, one-off migrations, debugging), not only seeding.

## Architecture reference

### Layers

The infrastructure is organised in 6 phases, deployed in dependency order ([index.ts](index.ts) composes the modules):

| Layer | Module | Resources |
| --- | --- | --- |
| 1 | `storage` | Frontend bucket (SPA hosting), public & private upload buckets, boot-diagnostics bucket |
| 2 | `dns` | CAA records (restrict cert issuance to Let's Encrypt; TLS itself is terminated at the LB) |
| 3 | `network`, `registry` | VPC, private networks, container registry |
| 4 | `database` | Managed PostgreSQL 17 — 17+ required: the sync engine's draft boundary uses logical-replication row filters with `REPLICA IDENTITY FULL` |
| 5 | `secrets`, `compute`, `vm-iam` | Secret Manager, Docker Compose VMs, VM-reader IAM grant |
| 6 | `loadbalancer` | Scaleway LB with TLS termination, same-origin path routing, DNS |

### How config flows

```
shared/config/config.default.ts   → appConfig (slug, domain, URLs, S3 settings)
shared/config/config.production.ts → overrides for production mode
        ↓
infra/config/*.config.ts          → fork-owned sizing/feature knobs (VMs, DB, secrets map)
        ↓
infra/pulumi-context.ts           → derives all naming, domains, regions; binds config + appConfig
        ↓
infra/resources/*.ts              → uses naming + `infra` (resolved config) + infraConfig (secrets/break-glass)
        ↓
Pulumi.<stack>.yaml               → encryption salt + transient operator toggles only
```

No resource names, domains, bucket names, or sizing are hardcoded in the Pulumi modules. Everything flows from `appConfig` and the `config/` files.

### Stacks

Only `production` is supported out of the box, but additional stacks (e.g. `staging`) can be added. This will be documented later.

### File structure

```text
infra/
├── agent/                  cella-boot-agent source + its container image
├── caddy/                  Frontend Caddy proxy image and config
├── cli/                    Infra CLI
├── compose/                Build and generate compose.gen.yml
├── config/                 Where customisable config lives
├── lib/                    Shared infra utilities used across Pulumi resources and tasks
├── resources/              Pulumi resources: network, db, compute, LB ...
├── tasks/                  Non-interactive operator/CI tasks (key setup, verification, waits)
├── tests/                  Higher-level infra test coverage

.github/workflows/          CI half of the deploy control plane
├── deploy.yml              The complete deploy flow
└── infra-preview.yml       `pulumi preview` on PRs touching infra/ or shared/
```

The `.github/workflows/` files are tightly coupled to this package: `deploy.yml` builds the release images, uploads the frontend bundle, runs the same `pulumi up` the CLI does (authenticating with the CI deploy key), and verifies the VM rollout. `infra-preview.yml` mirrors the **Preview** CLI action on PRs.

## Advanced operations

### Reset the database

Wipes the app's logical database and rebuilds it from migrations + the admin seed. For large rewrites, where replaying migration history is not worth it and a clean baseline is. **Pre-production, or with services deliberately quiesced — this is a hard outage.**

Run the CLI (`pnpm infra`) and pick **Reset database**. It takes a backup (aborting unless it reports ready), deletes and recreates the logical database over the Scaleway API with a bootstrap key, and re-grants both roles. It never exposes the database and never runs `pulumi up`.

Then run the two steps it prints, on the serial console:

```bash
cd /opt/app
docker compose --profile backend run --rm migrate
docker compose --profile backend run --rm -e ADMIN_EMAIL=you@example.com migrate node dist/seeds-bundle.js init
```

Confirm with `curl https://<your-app>/api/health?depth=full` — all components `healthy`.

Four things are worth understanding before running it:

- **Nothing but you stops this.** Scaleway's API deletes a live database with connected clients and an active replication slot; PostgreSQL alone refuses that. Maintenance mode is a convention here, not an interlock — the typed `<database>@<instance>` confirmation is the guard.
- **Re-granting is mandatory, and the task owns it.** Deleting a database drops its Scaleway privileges, and neither a recreate nor a _backup restore_ brings them back — a per-database `pg_dump` carries table ACLs but not database-level ones, so `CONNECT` is absent and the app reports `database_unreachable`.
- **Pulumi is untouched.** Scaleway's resource IDs are name-derived, so a same-name recreate yields identical IDs and stack state stays correct. No `pulumi up`, no secret churn, no VM roll.
- **The CDC worker needs no restart** — it re-ensures its replication slot on every retry.

If the task fails after the delete, it prints the exact `scw rdb backup restore` command plus the two `privilege set` calls a restore does not perform.

### Updating the boot agent

The boot agent is a normal registry container, not a baked base image. CI rebuilds and pushes it per commit ([agent/Dockerfile](agent/Dockerfile)), so any change under [agent/](agent/) ships on the next deploy with no extra step. To build it locally:

```bash
pnpm --filter infra agent:image   # tsup bundle + docker build (tag via AGENT_IMAGE)
```

The VM base image itself is the stock `docker` marketplace label (`compute.image`); set it to a literal image UUID only to **pin** a specific base for rollback.

### Key rotation

1. Generate a temporary bootstrap key. Personal API Key is fastest.

2. Run the CLI and pick **Rotate keys**:

   ```bash
   pnpm infra
   ```

   This mints a fresh `<slug>-ci-deploy` key and (if `gh` is authenticated) pushes it to the `production` GitHub Environment as `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`. It also mints a fresh `<slug>-vm-reader` key and writes it to Secret Manager. Neither key is written to stack config.

3. The next CI deploy authenticates with the new CI key from the GitHub Environment; no commit needed. The new VM reader key is baked into VM cloud-init on the next `pulumi up`; because that changes the boot script, the VMs are replaced (the LB health checks bridge the transition).

4. **Revoke the bootstrap key** in the Scaleway console.

### Passphrase rotation

The Pulumi passphrase encrypts the stack's secret outputs (e.g. the DB connection string) in the state bucket. To rotate it, run the CLI (`pnpm infra`) and pick **Rotate passphrase**. The action:

1. Verifies the current passphrase, then generates a new one, shown once; store it in your password manager before the rotation runs.
2. Re-encrypts the stack (`pulumi stack change-secrets-provider passphrase` rewrites both the state object and `Pulumi.<stack>.yaml` with a fresh `encryptionsalt`), under the stack lock so a concurrent CI deploy cannot read state mid-rotation, and verifies the rewritten file decrypts with the new passphrase.
3. Syncs the new `PULUMI_CONFIG_PASSPHRASE` to the GitHub Environment (when `gh` is authenticated).
4. Reminds you to commit the updated `infra/Pulumi.<stack>.yaml`.

Unlike **Rotate keys**, no bootstrap key is needed: nothing changes on the Scaleway side, so any key with state-bucket access works (CI deploy key or an operator key). A drifted or missing `PULUMI_CONFIG_PASSPHRASE` Environment secret can also be repaired without rotating: every `pnpm infra` **Resume**/**Rotate keys** run re-syncs the verified passphrase when `gh` is authenticated.

> Losing the current passphrase means you cannot decrypt existing secret outputs; there is no recovery. The GitHub Environment holds a copy, but Actions secrets are write-only: CI keeps working with it, yet it can never be viewed again, so keep your password-manager copy current.

<a id="clean-slate"></a>

### Clean slate (start over from scratch)

1. `rm infra/Pulumi.<stack>.yaml`
2. (optional) Scaleway console → Object Storage → delete bucket `<slug>-pulumi-state`. Note: Scaleway reserves bucket names for several hours after deletion.
3. (optional) Revoke the bootstrap API key in the Scaleway console.
4. (optional) Delete IAM application `<slug>-ci-deploy` and its policy.
5. (optional) Remove `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` from the `production` GitHub Environment (Settings → Environments → production → Environment secrets).
6. Re-run: `pnpm infra`
