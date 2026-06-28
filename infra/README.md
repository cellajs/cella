# infra cli

Push to `main` and a new VM generation is rolled out automatically. Fully using Infrastructure as Code. On fully European infra using mostly [Scaleway](https://www.scaleway.com/).

Similar to SST, this infra deployment flow uses [Pulumi](https://www.pulumi.com/) as its engine.


## Overview

The infrastructure is built around three principles:

1. **Create-then-replace.** A release and an infra change are the same operation: every deploy bakes the image SHA into a *new* VM generation's cloud-init, brings it up (cutover), then retires the old one.
2. **Descending-privilege credentials.** Three keys, each creating the next (bootstrap → CI deploy → VM reader), so no privileged key ever lives on your laptop. CI only holds what it needs.
3. **DRY config.** IaC is great for inheriting config to keep configuration DRY. See also [config files](#configuration).

The key resources and how traffic flows between them:

```
                          ┌─────────────────────────────────────────┐
        Users ──▶ DNS ──▶ │           Scaleway Load Balancer        │  TLS termination,
                          │           (host-header routing)         │  host-header routing
                          └─────────────────────────────────────────┘
                              │                              │
              api.<domain>    │                              │   <domain>
                              ▼                              ▼
   ┌───────────────────────────────────────────────────────────┐
   │                   Private network (VPC)                    │
   │                                                            │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
   │  │ backend  │  │ frontend │  │ optional │  │ optional │    │
   │  │   VM     │  │ VM Caddy │  │ VM (cdc, │  │ VM (yjs, │    │
   │  │          │  │          │  │  ai …)   │  │  …)      │    │
   │  └────┬─────┘  └────┬─────┘  └──────────┘  └──────────┘    │
   │       │             │ reverse-proxy → frontend bucket      │
   │       ▼             ▼          (SPA static files)          │
   │  ┌──────────────┐                                          │
   │  │ PostgreSQL   │           (managed, private)             │
   │  └──────────────┘                                          │
   └───────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │  upload buckets      │
                    │  (public + private)  │
                    └──────────────────────┘
```

- **Load balancer** — single public entrypoint.
- **Private network (VPC)** — VMs and db connect over private IPs; only LB is publicly reachable (no SSH).
- **Frontend** — a Caddy VM behind the LB that reverse-proxies the SPA static-file bucket (adds security headers + rewrites 404→index.html for SPA routes).
- **Backend VM** — the critical API path; replaced one generation at a time with LB overlap.
- **Optional VMs** — `cdc`, `yjs`, `ai` run on their own VM generations when enabled.
- **Database** — managed PostgreSQL reachable only from inside private network.
- **Buckets** — public and private object storage for uploads, plus frontend SPA bucket.


## How a deploy works

The deployment lifecycle — what happens when you push to `main`:

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

At runtime, the load balancer targets the host port published by the service's compose profile directly. There is no background polling agent and no separate proxy sidecar. The `frontend` service is itself a Caddy proxy image that serves the SPA bucket through the same VM/LB path as other services.

```
Scaleway LB ──▶ service VM host port ──▶ service container
```

The primary rollout service (the one that owns migrations) is verified first, then the rest in parallel. `cdc` has no public health endpoint; its replacement is confirmed indirectly by the primary public service coming up healthy.

**Rollback:** the last good generation is retained as `previous` in the control ledger. Its VM is kept but **powered off** (off the LB, so its compute billing is paused — a deploy never pays for two running generations per service), making a rollback a pointer flip **and power-on** rather than a rebuild. Re-running the workflow on the previous commit also works and follows the exact same forward path — it reuses the retained generation because the `genId` is content-addressed.

## The three credentials

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
|-----|-------------|----------|-------------|
| **Bootstrap key** | Owner (via Personal API Key) **or** ProjectManager + IAMManager on a dedicated IAM application | Minutes — revoked immediately after each use (initial bootstrap or manual rotation). Also required for any `pulumi up` that touches bootstrap-owned modules (DB, VPC, private network). | Password manager only, never on disk |
| **CI deploy key** (`<slug>-ci-deploy`) | Write on compute / LB / edge / secrets / object storage / registry; **read-only** on VPC / private network / RDB (those are bootstrap-owned). Project-scoped, plus DNS at org scope. | Long-lived; rotate manually by re-running the CLI's **Rotate keys** action (see [Key rotation](#key-rotation)) | The `production` GitHub Environment secrets `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` (environment-scoped, not repo-scoped). The Scaleway provider authenticates from those env vars, not from stack config. |
| **VM reader key** (`<slug>-vm-reader`) | Read-only registry / Secret Manager (incl. `SecretManagerSecretAccess` for decrypt-read). Just enough for a VM to pull images and hydrate `/opt/app/.env.runtime`. | Long-lived; rotates with the CI key | Seeded into Scaleway Secret Manager at bootstrap (the `vm-reader-key` secret), read back at `pulumi up`, and baked into VM cloud-init. Not in stack config. |

## Routine deploys (CI)

The workflow at [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) runs:

- **On push to `main`** — builds images, uploads frontend, runs `pulumi up`, verifies deployment.
- **On manual dispatch** — same, against chosen environment (`staging` or `production`).


CI builds the image, records the release SHA as the rollout INTENT in the S3 control object, and [tasks/deploy-service.ts](tasks/deploy-service.ts) drives a **new VM generation** (`vm-<svc>-<genId>`) with that SHA baked into its cloud-init. The `genId` is **content-addressed** — a hash of the release SHA plus the generation's static config — so re-running a deploy reuses the same generation (a true no-op) and a manual `pulumi up` can never fork identity. For LB-backed services the reconciler expands the LB backend to `[old,new]`, waits until the public `/health` can serve the expected `X-App-Version`, then contracts to `[new]`; the promoted old generation is retained as `previous` for a pointer-flip + power-on rollback (its VM is powered off to pause its compute billing). See [rollout strategies](#rollout-strategies) for the model.

To trigger a staging deploy: GitHub → Actions → Deploy → Run workflow → select `staging`.

To gate production behind manual approval, configure a [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) named `production` with required reviewers — the workflow already targets it.


## Rollout strategies

Every deploy is a **create-then-replace**: the image SHA is baked into a new VM generation's cloud-init, so a release and an infra change flow through one path (there is no background polling agent and no in-VM blue/green). Each service declares its replacement strategy in the fork-owned registry ([config/services.config.ts](config/services.config.ts)).

| `replacementStrategy` | Services | How |
|----------|----------|-----|
| **lb-overlap** | backend, frontend, ai, yjs | Record the SHA as `pendingSha`; the Pulumi program materialises the content-addressed pending generation alongside the active one. [tasks/cutover.ts](tasks/cutover.ts) then runs a **level-triggered reconciler**: it reads the live LB server list and drives it toward the desired state with idempotent Scaleway `SetBackendServers` calls — expand to `[old,new]`, health/version-gate through the public LB, contract to `[new]`, drain. It never silently skips the corrective call, so an empty/stale pool (or a same-generation redeploy) is repaired rather than assumed correct. The old generation is promoted to `previous` and retained for rollback; a single reconcile `pulumi up` at the end of the rollout powers off every `previous` generation (pausing its compute billing) and reaps the previous-previous straggler. |
| **exclusive** | cdc | No LB overlap: cdc holds one Postgres replication slot. The Pulumi program materialises only the new generation (the old one is replaced in the same `up`); the new worker contends for the slot the old one releases on drain (handoff is lossless — the slot retains the WAL position). |

**`drainPolicy`** tunes how the old generation leaves the LB: `requests` (HTTP — `onMarkedDownAction: none`, in-flight requests finish) for backend/frontend/ai, or `reconnect` (WebSocket — sessions shed, clients re-dial and resync from durable state) for yjs.

[tasks/cutover.ts](tasks/cutover.ts) contains the pure, unit-tested **level-triggered** reconciler core for the explicit LB-overlap path: it reads the live server list and drives it toward the desired state (expand→health→contract→drain) with idempotent `SetBackendServers` calls, never silently skipping the corrective call. [tasks/deploy-service.ts](tasks/deploy-service.ts) wraps it with Pulumi bookends: record the SHA as `pendingSha` in the **S3 control object** (`control/<stack>.json` in the state bucket — the source of truth the Pulumi program reads), `pulumi up` to materialise the content-addressed generation, run the reconciler, then `promote` it to `active` (the old active becomes `previous`, retained for rollback). Internal consumers reach a service over the private network with `@{<svc>.privateIp}`, which resolves to that service's current generation IP baked in at deploy time — the rollout order (the stable service first, e.g. backend before cdc) means a consumer redeployed afterwards always binds the freshly promoted generation. A frontend **content** release is just an S3 upload (no VM cutover); only a Caddy/CSP/cloud-init change replaces the frontend VM.

### One-time migration: control object schema v1 → v2

The rollout state moved from a numeric `gen` counter (schemaVersion 1) to a content-addressed deploy ledger (schemaVersion 2), and VM resources are renamed `vm-<svc>-<gen>` → `vm-<svc>-<genId>`. The Pulumi program rejects a v1 control object, and the first deploy replaces every generation VM (a one-time, bounded downtime per service — backend first). Run the migration **once per stack, before the first deploy on the new code**, with an operator key in env:

```bash
# Preview the rewrite without touching the object:
SCW_ACCESS_KEY=… SCW_SECRET_KEY=… pnpm --filter infra migrate-control-store --stack production --dry-run

# Apply it (carries each service's current SHA forward as `pendingSha`):
SCW_ACCESS_KEY=… SCW_SECRET_KEY=… pnpm --filter infra migrate-control-store --stack production
```

The task is idempotent: it no-ops when the object is already v2 or absent. Carrying the live SHA as `pendingSha` makes the replacement land on the current image (not the `latest` placeholder), then the normal rollout reconciler points the LB at the new generation and promotes it. Do the same for `staging` first to rehearse.

### Runtime secret delivery

Runtime secrets reach a VM through `/opt/app/.env.runtime`, a docker-compose `env_file` that the on-VM boot agent writes from Secret Manager at boot. Because an `env_file` is line-based, **every secret value must be a single line**. Multi-line values (e.g. a PEM certificate) must be stored **base64-encoded** and decoded by the consuming service — this is what `DATABASE_SSL_CA` does (encoded in [resources/secrets.ts](resources/secrets.ts), decoded in the db clients). A `required` secret that can't be delivered fails the sync, which by design blocks the service from booting rather than letting it crash-loop behind a 502.

Two safeguards keep a runtime-secret change from causing the kind of full outage a mis-delivered secret would otherwise trigger. They were added after a multi-line secret (`DATABASE_SSL_CA`) bricked a backend rollout, and they sit alongside the single-line/base64 contract above:

1. **The secret *manifest* is baked into the new generation's cloud-init.** The per-service manifest (the list of which secrets a VM hydrates — metadata only, never values) is built by Pulumi ([resources/compute.ts](resources/compute.ts)) and written into cloud-init. Because every deploy already replaces the VM, there is no out-of-band channel to maintain; the first-boot agent reads the manifest and hydrates `/opt/app/.env.runtime` before the app starts.
2. **Deliverability is preflighted in CI before rolling.** Right after `pulumi up` — and before any VM is rolled or replaced — the deploy asserts that every `required` secret can actually be hydrated the way a VM will (fetched from Secret Manager and single-line / decodable), failing loudly with the offending env vars instead of bricking the fleet ([tasks/assert-secrets-deliverable.ts](tasks/assert-secrets-deliverable.ts), wired into the `pulumi` job as **Verify runtime secrets are deliverable**, mirroring the existing **Verify VM reader IAM grant** preflight). The single-line rule itself lives in one place, [lib/env-file.ts](lib/env-file.ts), shared by the preflight and the on-VM boot agent that performs the hydration.

## Configuration

All tunable infra config lives in committed, type-checked files under [config/](config) — edit a value there and deploy. Each field is either a single value or a per-mode map (`{ production: …, staging: … }`).

**Common questions:**
- *Where do I change a VM size?* → `instanceType` in [config/services.config.ts](config/services.config.ts) (applied by the next CI deploy).
- *Where do I change the database size?* → DB node type & volume in [config/general.config.ts](config/general.config.ts) (bootstrap-owned RDB — apply via [Changing infrastructure](#changing-infrastructure)).

| File | Owns | Applied by |
|------|------|------------|
| [config/services.config.ts](config/services.config.ts) | Per-service VM size (`instanceType`, required), replacement strategy, drain policy, LB routing, env, feature flags | routine CI deploy |
| [config/general.config.ts](config/general.config.ts) | DB node type & volume, asset retention | DB fields via CLI **Apply infra change** (bootstrap-owned RDB); the rest via routine CI deploy |
| [config/runtime-secrets.config.ts](config/runtime-secrets.config.ts) | Which services receive each runtime secret | routine CI deploy |

What stays in Pulumi config (not committed fork data): the encryption salt, the transient DB public-endpoint break-glass toggle (`infra:dbPublicEndpoint` / `infra:dbPublicAcl`), and the bootstrap `computeDeferred` lifecycle marker. Per-service rollout state (generation + image SHA) lives in the **S3 control object** (`control/<stack>.json` in the state bucket), not in committed config — written by the deploy around each cutover and read by the Pulumi program at plan time. A conditional-write lock (`control/<stack>.lock.json`) prevents a CI deploy and an operator `apply` from mutating the same stack concurrently; clear a stale lock with the CLI **Unlock** action.

## Changing infrastructure

Most config changes ship through a normal CI deploy. But **bootstrap-owned** resources — the database, VPC, and private network — can only be mutated with a temporary bootstrap key. 

To apply a bootstrap-owned change (e.g. resize the database), re-run the CLI (`pnpm infra`) and choose **Apply infra change**. The action:

1. Prompts for the Pulumi passphrase and a fresh bootstrap key (broad permissions, see [Generate a bootstrap API key](#2-generate-a-bootstrap-api-key)).
2. Supplies that key to the Scaleway provider via `SCW_*` env (it is never written to stack config).
3. Runs `pulumi up` against the already-bootstrapped stack. Compute stays up — unlike the fresh-provision flow, Apply infra change does **not** set the `bootstrap:computeDeferred` marker, so the running VMs/LB are left in place.
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

This key is used *only* during bootstrap and is revoked immediately after. It needs to create IAM applications and policies (i.e. `IAMManager` plus enough to read your project).

**Easiest path — Personal API Key.** If you're an Owner on the organization, just generate a [Personal API Key](https://console.scaleway.com/iam/users) (User menu → API keys → Generate). It inherits your Owner permissions, which is everything bootstrap needs. Delete it the moment bootstrap finishes.

**Stricter alternative — dedicated bootstrap application.** If you'd rather not use a personal key, create an Application in [IAM → Applications](https://console.scaleway.com/iam/applications) (e.g. `bootstrap`) with a policy granting **ProjectManager + IAMManager** on the organization, and generate an API key for it. More setup, same outcome.

Save the access key, secret key, project ID, and organization ID in your password manager for the duration of the bootstrap session only.

### 3. Pick a Pulumi passphrase

Generate a strong passphrase (e.g. `openssl rand -base64 24`). Save it in your password manager, losing it means rebuilding the stack from scratch.

### 4. Run the infra CLI

```bash
pnpm infra
```

The CLI:

- Creates state storage
- Initializes Pulumi
- Creates required credentials
- Configures GitHub (if available)
- Optionally runs the first pulumi up


### 5. Compute base image

Service VMs boot from Scaleway's stock **`docker`** marketplace image (Docker Engine + the Compose plugin, preinstalled and current) — set as `compute.image` in [config/general.config.ts](config/general.config.ts) and passed straight to the instance. There is **no image bake**: the `cella-boot-agent` ships as a normal registry container ([agent/Dockerfile](agent/Dockerfile)) that CI builds and pushes per commit, and every VM `docker run`s it at first boot (mounting the host Docker socket) to bring its compose stack up. Cloud-init shrinks to a launcher that writes the boot plan, logs the host into the registry, and runs the agent container; the agent owns the boot state machine (compose/env files, runtime-secret hydration, image pull, migrate, app start).

Set `compute.image` to a literal image UUID only to **pin** a specific base image for rollback.

### 6. Commit and push

After the first local `pulumi up` finishes, commit the updated `infra/Pulumi.production.yaml` and push to `main`. CI will then build and push the Docker images, run `pulumi up` again, and bring the compute VMs up automatically.

The first local `pulumi up` does **not** depend on GitHub secrets — but the CI run after you push does. If they're missing, the CI step fails and the VMs will not come up.

If `gh` CLI was authenticated during bootstrap, it already set the GitHub Environment secrets it manages on `production`. Otherwise add them manually under **Settings → Environments → `production` → Environment secrets** (preferred — environment-scoped) rather than repo-level secrets:

| Secret | Value | Scope | Set by bootstrap? |
|---|---|---|---|
| `SCW_ACCESS_KEY` | CI deploy key access key | environment | ✓ if `gh` |
| `SCW_SECRET_KEY` | CI deploy key secret key | environment | ✓ if `gh` |
| `PULUMI_CONFIG_PASSPHRASE` | The passphrase | environment | manual |
| `SCW_PROJECT_ID` | Scaleway project ID | environment | ✓ if `gh` |
| `SCW_ORGANIZATION_ID` | Scaleway organization ID | environment | ✓ if `gh` |

### 7. Revoke the bootstrap key

> **Do this immediately after bootstrap completes.**

1. Go to [IAM → API Keys](https://console.scaleway.com/iam/api-keys) and delete the bootstrap key.
2. Optionally delete the temporary bootstrap application too.

After bootstrap, only the long-lived deploy and VM keys should remain. From here on, **all routine deploys happen in CI**.

### 8. Create the first admin

A fresh production database has **no users**, so there is no way to sign in to the deployed app yet. CI deploys only run schema migrations (the one-shot `migrate` companion) — they do **not** seed. You must create the first admin once, by hand.

The backend image ships a bundled, production-safe seed runner ([backend/scripts/seeds-bundle.ts](../backend/scripts/seeds-bundle.ts), the `seed:production` script). It applies migrations + DB roles and then inserts a single admin user (idempotent — it skips if the users table is already non-empty). The admin signs in via a magic link sent to `ADMIN_EMAIL`, so working outbound email and a mailbox you control are required.

**Recommended — run it on a VM via the serial console** (no DB exposure, uses the image already on the box):

1. After the first CI deploy has brought the compute VMs up, open a backend instance in the [Scaleway console](https://console.scaleway.com/instance/servers) → **Console** (serial console) and log in with the root password shown on the instance page.
2. Run the seed once, supplying the admin email:

   ```bash
   cd /opt/app
   docker compose --profile backend run --rm -e ADMIN_EMAIL=you@example.com migrate node dist/seeds-bundle.js init
   ```

   This reuses the `migrate` companion's image and `.env`/`.env.runtime` (which carry `DATABASE_ADMIN_URL`), overriding only the command to run the seed bundle.
3. Open the app, request a magic link for `you@example.com`, and sign in.

**Alternative — break-glass from your laptop.** If you'd rather not use the serial console, temporarily expose the database, run the seed locally against `DATABASE_ADMIN_URL`, then close the endpoint again. This is heavier (two bootstrap-key `pulumi up` runs to open and re-close the RDB public endpoint) and briefly exposes the DB, so prefer the serial-console path:

1. Open the DB public endpoint locked to your IP (bootstrap-owned RDB, see [Changing infrastructure](#changing-infrastructure)):

   ```bash
   cd infra
   pulumi config set infra:dbPublicEndpoint true
   pulumi config set infra:dbPublicAcl "<your.ip>/32"
   # then Apply infra change (pnpm infra → Apply infra change) with a bootstrap key
   ```
2. Run the seed locally against the admin connection string:

   ```bash
   ADMIN_EMAIL=you@example.com DATABASE_ADMIN_URL='<admin connection string>' pnpm --filter backend seed:production init
   ```
3. **Close the endpoint again** — unset `infra:dbPublicEndpoint`/`infra:dbPublicAcl` and re-run Apply infra change, then revoke the bootstrap key.

## Architecture reference

### Layers

The infrastructure is organised in 6 phases, deployed in dependency order ([index.ts](index.ts) composes the modules):

| Layer | Module | Resources |
|-------|--------|-----------|
| 1 | `storage` | Frontend bucket (SPA hosting), public & private upload buckets, boot-diagnostics bucket |
| 2 | `dns` | CAA records (restrict cert issuance to Let's Encrypt; TLS itself is terminated at the LB) |
| 3 | `network`, `registry` | VPC, private networks, container registry |
| 4 | `database` | Managed PostgreSQL 17 |
| 5 | `secrets`, `compute`, `vm-iam` | Secret Manager, Docker Compose VMs, VM-reader IAM grant |
| 6 | `loadbalancer` | Scaleway LB with TLS termination, host-header routing, DNS |


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

No resource names, domains, bucket names, or sizing are hardcoded in the Pulumi modules — everything flows from `appConfig` and the `config/` files.

### Stacks

Only `production` is supported out of the box, but additional stacks (e.g. `staging`) can be added. This will be documented later. 

### File structure

```text
infra/
├── agent/                  cella-boot-agent source + its container image (Dockerfile), `docker run` at VM first boot
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

3. The next CI deploy authenticates with the new CI key from the GitHub Environment — no commit needed. The new VM reader key is baked into VM cloud-init on the next `pulumi up`; because that changes the boot script, the VMs are replaced (the LB health checks bridge the transition).

4. **Revoke the bootstrap key** in the Scaleway console.

### Changing the Pulumi passphrase

The passphrase encrypts the stack's secret outputs (e.g. the DB connection string) in the state bucket. To change it, re-encrypt the stack with the old passphrase in hand, then update the GitHub Environment:

1. Re-encrypt the stack secrets with a new passphrase:

   ```bash
   cd infra
   PULUMI_CONFIG_PASSPHRASE='<current passphrase>' pulumi stack change-secrets-provider passphrase
   # prompts for the new passphrase, then re-encrypts state and Pulumi.<stack>.yaml
   ```

2. Update `PULUMI_CONFIG_PASSPHRASE` in the `production` GitHub Environment (Settings → Environments → production → Environment secrets) and in your password manager.

3. Commit the updated `infra/Pulumi.<stack>.yaml` (the `encryptionsalt` changes).

> Losing the current passphrase means you cannot decrypt existing secret outputs — there is no recovery, so you must hold it to perform this change.

<a id="clean-slate"></a>
### Clean slate (start over from scratch)

1. `rm infra/Pulumi.<stack>.yaml`
2. (optional) Scaleway console → Object Storage → delete bucket `<slug>-pulumi-state`. Note: Scaleway reserves bucket names for several hours after deletion.
3. (optional) Revoke the bootstrap API key in the Scaleway console.
4. (optional) Delete IAM application `<slug>-ci-deploy` and its policy.
5. (optional) Remove `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` from the `production` GitHub Environment (Settings → Environments → production → Environment secrets).
6. Re-run: `pnpm infra`
