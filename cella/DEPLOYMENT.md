# Deployment

This document explains how a cella app deploys to European cloud provider [Scaleway](https://www.scaleway.com/): the resources that get provisioned, the release pipeline, and the operational tasks around it. The code lives in the [infra](../infra/) package; see its [README](../infra/README.md) for the product view and the shared [vocabulary](../infra/README.md#vocabulary).

### TL;DR

Publishing a release starts an automatic deployment. It creates new servers for that exact version,
checks them, moves traffic without downtime, and removes the old servers.
[Pulumi](https://www.pulumi.com/) manages the cloud resources and GitHub Actions triggers the deploy command.
Separate credentials are used for initial setup, automated deployment, and running servers, so
each stage has only the permissions it needs.

## Overview

Three principles ([infra/README.md](../infra/README.md#core-philosophy)): **create-then-replace** (a new VM generation per deploy, cut over, old one reaped), **descending-privilege credentials**, and **automation without Kubernetes** via type-checked [config files](#configuration). Resources and traffic flow:

```
                             Users / browsers
                                     │  https://<domain>
                                     ▼
            ┌─────────────────────────────────────────────────┐
            │             Scaleway Load Balancer              │  TLS termination,
            │  default    →  frontend VM                      │  one public IP
            │  /api       →  backend VM                       │
            │  /cdc, /yjs →  worker VMs                       │
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

- **Load balancer:** the only public entrypoint. Backend, yjs and mcp share the app origin via registry-declared `pathPrefix` values (`/api`, `/yjs`, `/mcp`); the LB never rewrites paths. `cdc` never takes an LB route.
- **VMs:** public IP for egress only (image pulls); all inbound dropped, including SSH. Workers get their own VM unless `singleVm` co-hosts them on the backend VM.
- **Frontend VM:** Caddy adds security headers/CSP and the SPA deep-link fallback.
- **Database:** private-network only; a break-glass toggle can expose it temporarily ([Changing infrastructure](#changing-infrastructure)).
- **Buckets:** outside the VPC; browsers read the public upload bucket directly and use presigned URLs for the private one.

## Deploy flow

```
Release published (or manual dispatch)
        ↓
CI builds images in parallel
        ↓
`infra deploy` (one command): preflights + stack lock;
frontend build + asset upload run inside it, concurrent
with the wait for image tags
        ↓
Wave 1: provision + cut over the primary service (backend)
        ↓
Wave 2: ONE stack update provisions every remaining generation;
        cutovers run concurrently per service
        ↓
Verify every public service serves the expected SHA
        ↓
Publish frontend entry files (atomic flip) + smoke checks
        ↓
One final stack update reaps every displaced generation
```

The LB targets the host port each service's compose profile publishes:

```
Scaleway LB ──▶ service VM host port ──▶ service container
```

The primary service owns migrations. `cdc` has no public health endpoint; its replacement is confirmed by the primary public service coming up healthy.

**Rollback:** nothing is retained for two generations. Commit a revert and redeploy: same forward path, every service recreated (cdc in place), cached generation reused because `genId` is content-addressed.

## Credentials

Scaleway API keys descend in privilege, each in a different store, each minting the next:

```
Bootstrap key      (broad, short-lived; in your password manager only)
    │ creates
    ▼
CI deploy key      (project-scoped write; in GitHub Environment)
    │ mints per deploy
    ▼
boot + service keys (scoped per principal; boot key baked into the VM,
    │ reads          the service key arrives via a single-access handoff bundle)
    ▼
runtime secrets + images on VM
```

| Key | Permissions | Lifetime | Where stored |
| --- | --- | --- | --- |
| **Bootstrap key** | Owner (via Personal API Key) **or** ProjectManager + IAMManager on a dedicated IAM application | Minutes: revoked after each use. Required for any `pulumi up` that touches bootstrap-owned modules (DB, VPC, private network). | Password manager only, never on disk |
| **CI deploy key** (`<slug>-ci-deploy`) | Write on compute / LB / edge / secrets / object storage / registry; **read-only** on VPC / private network / RDB (those are bootstrap-owned). Project-scoped, plus DNS at org scope. | Long-lived; rotate via the CLI **Rotate keys** action ([Key rotation](#key-rotation)) | The `production` GitHub Environment secrets `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` (environment-scoped, not repo-scoped). |
| **Boot + service keys** (`<slug>-<mode>-boot`, `<slug>-<mode>-vm-<service>`) | Boot key: registry pull + boot-diag write + handoff-only secret read. Service key: path-conditioned secret read (its own + shared folders); the backend additionally gets granular S3 object sets. | Minted per deploy by the CI key; superseded keys are pruned on the next mint | Boot key baked into VM cloud-init; each service key delivered via a single-access handoff bundle in Secret Manager. Not in stack config. |

The **Pulumi passphrase** sits outside the chain: it encrypts the stack's secret outputs in the state bucket, is generated at bootstrap and synced to the GitHub Environment. Store it in your password manager when shown ([Passphrase rotation](#passphrase-rotation)).

## CI deploys

[.github/workflows/deploy.yml](../.github/workflows/deploy.yml) is a thin trigger (push to main, release published, manual dispatch) for the reusable [.github/workflows/deploy-pipeline.yml](../.github/workflows/deploy-pipeline.yml): `setup` derives names and matrices from config, a build matrix pushes images, and one `deploy` job runs a single command:

```
pnpm --filter infra run deploy --mode <staging|production> --sha <sha> --git-ref <ref>
```

[tasks/deploy-run.ts](../infra/tasks/deploy-run.ts) (entered via [tasks/deploy.ts](../infra/tasks/deploy.ts)) owns everything after the image builds: preflights, stack lock (released in `finally`), frontend build and asset upload, base stack update, waved rollout, version verification, atomic frontend entry publish, smoke checks, boot diagnostics on failure.

The rollout records the release SHA as `pendingSha` in the S3 control object; only the Pulumi program provisions generations (`vm-<svc>-<genId>`, `genId` content-addressed from release SHA plus static config), so a re-run is a no-op and a manual `pulumi up` cannot start a competing one. Cutover: [Rollout strategies](#rollout-strategies).

- Pushes to main auto-deploy **staging**. Bootstrap a `staging` [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) holding the `SCW_*` secrets before merging to main, or the push job fails. The newest push cancels a superseded in-flight staging run (`cancel-in-progress`); production rollouts never cancel. Manual: Actions → Deploy → Run workflow → `staging`.
- **Production** deploys only on a published release or a manual dispatch. For a manual promote, give the `production` GitHub Environment required reviewers; the run then pauses for approval.

### Bring your own CI

1. **Env**: export `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_DEFAULT_PROJECT_ID`, `SCW_DEFAULT_ORGANIZATION_ID`, `PULUMI_CONFIG_PASSPHRASE` (the workflow maps its `SCW_PROJECT_ID` / `SCW_ORGANIZATION_ID` secrets onto the `SCW_DEFAULT_*` names the Scaleway provider reads). Install node, pnpm, docker (buildx), and the pulumi CLI.
2. **Deploy**: `pnpm --filter infra run deploy --mode <mode> --sha <sha> --build`. `--build` bakes and pushes every image (app services + boot runner) via `docker buildx bake` with the registry `:buildcache` shared with CI. Safe to re-run; the stack lock serializes concurrent attempts.

GitHub Actions builds images as a parallel matrix and omits `--build`. `--dist <dir>` supplies a prebuilt frontend; `--git-ref`, when provided, gates production deploys to main/release refs.

## Rollout strategies

Each service declares its `replacementStrategy` in [config/services.config.ts](../infra/config/services.config.ts).

| Strategy | When | Behavior | Downtime |
| --- | --- | --- | --- |
| **start-first** | backend, frontend, yjs, mcp (LB-backed) | Pulumi provisions the pending generation next to the active one. [tasks/cutover.ts](../infra/tasks/cutover.ts) reconciles the live LB server list with idempotent `SetBackendServers` calls: expand to `[old,new]`, health/version-gate through the public LB, contract to `[new]`, drain. It always issues the corrective call, so an empty or stale pool is repaired. One final stack update reaps every displaced generation. | None (LB overlap). |
| **stop-first** | cdc (holds one Postgres replication slot) | Pulumi provisions only the new generation, replacing the old in the same `up`; the new worker takes the slot the old one releases on drain (lossless: the slot retains the WAL position). | Worker gap during replacement. |
| **exclusive** (`singleVm`) | the backend VM when it hosts a stop-first worker | Plan marked `exclusive` in [tasks/rollout-plans.ts](../infra/tasks/rollout-plans.ts): `drainSeconds` 0, no old IPs; the cutover health-gates, then points the LB pool straight at the new generation. | Yes, on that host. Split-VM (the default) is unaffected. |

**`drainPolicy`** tunes how the old generation leaves the LB: `requests` (HTTP; `onMarkedDownAction: none`, in-flight requests finish) for backend/frontend/mcp, or `reconnect` (WebSocket; sessions shed, clients re-dial and resync from durable state) for yjs.

[tasks/rollout.ts](../infra/tasks/rollout.ts) sequences the two waves in [Deploy flow](#deploy-flow). Internal consumers reach a service through the LB's ACL-guarded **internal route** at `@{<svc>.internalHost}:@{<svc>.internalPort}`, stable across cutovers; `@{<svc>.privateIp}` resolves a same-stack generation IP baked at deploy time. A frontend **content** release is an S3 upload only; a Caddy/CSP/cloud-init change replaces the frontend VM.

### Runtime secret delivery

Runtime secrets reach a VM through `/opt/app/.env.runtime`, a docker-compose `env_file` the boot runner writes from Secret Manager at boot.

- **Every secret value must be a single line** (an `env_file` is line-based). Store multi-line values such as a PEM certificate **base64-encoded** and decode them in the consuming service, as `DATABASE_SSL_CA` does (encoded in [resources/secrets.ts](../infra/resources/secrets.ts), decoded in the db clients). The rule lives in [lib/utils/env-file.ts](../infra/lib/utils/env-file.ts), shared by the preflight and the boot runner.
- An undeliverable `required` secret fails hydration and blocks boot, rather than crash-looping behind a 502.
- **The secret manifest is baked into cloud-init**: the per-service list of secrets a VM hydrates (metadata only, never values), built by Pulumi ([resources/compute.ts](../infra/resources/compute.ts)).
- **Deliverability is preflighted** before any VM rolls: the deploy asserts every `required` secret can be hydrated the way a VM will, failing with the offending env vars ([tasks/assert-secrets-deliverable.ts](../infra/tasks/assert-secrets-deliverable.ts): **Verify runtime secrets are deliverable**, next to **Verify VM IAM grants**).

### Certificate issuance and recovery

A new service's DNS record must propagate before Scaleway requests its Let's Encrypt certificate; otherwise ACME resolvers see `NXDOMAIN` and leave a terminally errored certificate Scaleway never retries. [`DnsPropagationGate`](../infra/resources/dns-cert-gates.ts) waits for public resolvers to return the LB IP first; `CertReadyGate` surfaces ACME failure details and delays frontend attachment until the certificate is ready. Both gates are create-only.

The deploy runs [`repair-certs.ts`](../infra/tasks/repair-certs.ts) before the base stack update: it removes terminally errored certificates from Pulumi state (a dependent frontend makes Pulumi refuse, preserving TLS material in use), then from Scaleway, so gated issuance can rerun. Manual run: `pnpm --filter infra repair-certs --stack <stack>`.

## Configuration

All tunable infra config lives in committed, type-checked files under [config/](../infra/config); edit and deploy. Each field is a single value or a per-mode map (`{ production: …, staging: … }`).

| File | Owns | Applied by |
| --- | --- | --- |
| [config/services.config.ts](../infra/config/services.config.ts) | Per-service VM size (`instanceType`, required), replacement strategy, drain policy, LB routing, env, feature flags | routine CI deploy |
| [config/general.config.ts](../infra/config/general.config.ts) | DB node type & volume, asset retention | DB fields via CLI **Apply infra change** (bootstrap-owned RDB); the rest via routine CI deploy |
| [config/runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts) | Which services receive each runtime secret | routine CI deploy |

- Pulumi config holds only the encryption salt, the transient DB public-endpoint break-glass toggle (`infra:dbPublicEndpoint` / `infra:dbPublicAcl`), and the bootstrap `computeDeferred` lifecycle marker.
- Per-service rollout state (generation + image SHA) lives in the **S3 control object** (`control/<stack>.json` in the state bucket), written by the deploy and read by the Pulumi program at plan time. A conditional-write lock (`control/<stack>.lock.json`) keeps a CI deploy and an operator `apply` from mutating the same stack concurrently; clear a stale lock with the CLI **Unlock** action.

## Changing infrastructure

Most config changes ship through a normal CI deploy. **Bootstrap-owned** resources (database, VPC, private network) can only be mutated with a temporary bootstrap key: `pnpm infra` → **Apply infra change**, which:

1. Prompts for the Pulumi passphrase and a fresh bootstrap key ([Generate a bootstrap API key](#2-generate-a-bootstrap-api-key)).
2. Passes the key to the Scaleway provider via `SCW_*` env; it is never written to stack config.
3. Runs `pulumi up` against the bootstrapped stack without setting `bootstrap:computeDeferred`, so the running VMs and LB stay in place.
4. Reminds you to revoke the bootstrap key.

> **Legacy IAM model (v1):** the engine assumes the per-service IAM model (v2) unconditionally; the migration tooling is gone. A stack still on the single vm-reader model must first run `pnpm infra` → **Migrate IAM model** (migrate, deploy, clean up legacy principals) from a checkout prior to this change.

## Fresh installation

`pnpm infra` launches the CLI ([cli/infra-cli.ts](../infra/cli/infra-cli.ts)); without a local `Pulumi.<stack>.yaml` it runs the install wizard. A fresh install defaults to **staging**; production is the same wizard via `pnpm infra --mode production`. `--defaults` takes every optional default and prompts only for required inputs (bootstrap key, admin email); `INFRA_NON_INTERACTIVE=1` also takes the defaults but fails on a required input with no environment value. `pnpm --filter infra status` shows the current state and next action.

### 1. Prerequisites

1. A domain, set as `appConfig.domain`, registered as external at https://console.scaleway.com/domains/external.
2. The Pulumi CLI:

   ```bash
   brew install pulumi/tap/pulumi
   ```

3. GitHub CLI (recommended), authenticated with `gh auth login`, so the wizard can set the GitHub Environment secrets.
4. Docker with buildx (recommended), so the wizard can run the first deploy locally.
5. A Scaleway project (optional): without `SCW_PROJECT_ID` in `backend/.env`, the wizard picks or creates one (named after the app slug) and writes the id back.

### 2. Generate a bootstrap API key

Used only during bootstrap and revoked right after.

1. Easiest: as an organization Owner, generate a [Personal API Key](https://console.scaleway.com/iam/users) (User menu → API keys → Generate). Delete it when bootstrap finishes.
2. Stricter: create an Application in [IAM → Applications](https://console.scaleway.com/iam/applications) with **ProjectManager + IAMManager** on the organization, and generate an API key for it.
3. Keep access key, secret key, project ID, and organization ID in your password manager for the session only.

### 3. Run the infra CLI

```bash
pnpm infra
```

1. Picks or creates the Scaleway project (prerequisite 5).
2. Generates the Pulumi passphrase. **Store it when shown**: it is shown once and unrecoverable (set `PULUMI_CONFIG_PASSPHRASE` beforehand to supply your own).
3. Creates state storage and initializes Pulumi.
4. Creates the required credentials.
5. Configures GitHub (if `gh` is authenticated).
6. Optionally runs the first `pulumi up` (registry, DB, network; no compute yet).
7. Offers the **first deploy** (the CI command with `--build`, using the new CI deploy key). Accepting ends with a live app; declining leaves it to CI (step 5).
8. Offers to **revoke the bootstrap key** as its last call.

### 4. Compute base image

Service VMs boot from Scaleway's stock **`docker`** marketplace image (`compute.image` in [config/general.config.ts](../infra/config/general.config.ts)); there is no image bake. Cloud-init writes the boot plan, logs into the registry, and `docker run`s the boot runner (`infra-boot`, host Docker socket mounted), which owns compose/env files, secret hydration, image pull, migrate, and app start ([Updating the boot runner](#updating-the-boot-runner)).

### 5. Commit and push

1. Commit `infra/Pulumi.<mode>.yaml` and push. If you declined the wizard's first deploy, CI's first run builds the images, runs the deploy command, and brings the VMs up.
2. CI needs the GitHub Environment secrets (the local wizard does not). If `gh` was authenticated, bootstrap already set them on `production`; otherwise add them under **Settings → Environments → `production` → Environment secrets** (environment-scoped, not repo-level):

| Secret | Value | Scope | Set by bootstrap? |
| --- | --- | --- | --- |
| `SCW_ACCESS_KEY` | CI deploy key access key | environment | ✓ if `gh` |
| `SCW_SECRET_KEY` | CI deploy key secret key | environment | ✓ if `gh` |
| `PULUMI_CONFIG_PASSPHRASE` | Pulumi passphrase (generated at bootstrap) | environment | ✓ if `gh` |
| `SCW_PROJECT_ID` | Scaleway project ID | environment | ✓ if `gh` |
| `SCW_ORGANIZATION_ID` | Scaleway organization ID | environment | ✓ if `gh` |

### 6. Revoke the bootstrap key

Do this immediately after bootstrap. The wizard's final step covers it; if you declined or it failed:

1. Delete the key at [IAM → API Keys](https://console.scaleway.com/iam/api-keys).
2. Optionally delete the temporary bootstrap application.

Only the long-lived deploy and VM keys remain.

### 7. Sign in as the first admin

The one-shot `backend-release` companion (the migrate step on every new generation) seeds a single admin when the users table is empty ([backend/src/main.migrate.ts](../backend/src/main.migrate.ts), idempotent), from the **required** `admin-email` runtime secret (`ADMIN_EMAIL`) the wizard prompts for; the deploy preflight refuses to roll while it is missing.

1. Open the app and request a magic link for the admin email.
2. Sign in. If magic links do not arrive, seed the Brevo API key (or your email provider's) via **Manage runtime secrets**.

**Fallback: seed by hand** via the serial console (backend instance in the [Scaleway console](https://console.scaleway.com/instance/servers) → **Console**, root password on the instance page), using the bundled seed runner ([backend/scripts/seeds-bundle.ts](../backend/scripts/seeds-bundle.ts)) with the `backend-release` image and its `.env`/`.env.runtime` (`DATABASE_ADMIN_URL`):

```bash
cd /opt/app
docker compose --profile backend run --rm -e ADMIN_EMAIL=you@example.com backend-release node dist/seeds-bundle.js init
```

**Alternative: break-glass from your laptop.** Briefly exposes the DB (ACL-locked to your IP), so prefer the serial console. Both flows serve any operator task against the live database; for staging, **Seed database** exposes, seeds, and closes in one go (refuses production).

1. Expose the DB (needs a bootstrap key); the ACL defaults to `<your.ip>/32` (open ranges refused) and the admin connection string is printed:

   ```bash
   pnpm infra   # → "Expose database publicly"
   ```

2. Seed locally:

   ```bash
   ADMIN_EMAIL=you@example.com DATABASE_ADMIN_URL='<printed connection string>' pnpm --filter backend seed:production init
   ```

3. **Close the endpoint again**, then revoke the bootstrap key:

   ```bash
   pnpm infra   # → "Stop public DB exposure"
   ```

## Architecture reference

[infra/README.md](../infra/README.md) owns the vocabulary and philosophy.

### Layers

[index.ts](../infra/index.ts) composes the modules in this order:

| Layer | Module | Resources |
| --- | --- | --- |
| 1 | `storage` | Frontend bucket (SPA hosting), public & private upload buckets, boot-diagnostics bucket |
| 2 | `dns` | CAA records (restrict cert issuance to Let's Encrypt; TLS itself is terminated at the LB) |
| 3 | `network`, `registry` | VPC, private networks, container registry |
| 4 | `database` | Managed PostgreSQL 17 (17+ required: the sync engine's draft boundary uses logical-replication row filters with `REPLICA IDENTITY FULL`) |
| 5 | `secrets`, `compute`, `vm-iam` | Secret Manager, Docker Compose VMs, per-service VM IAM policies |
| 6 | `loadbalancer` | Scaleway LB with TLS termination, same-origin path routing, DNS |

### How config flows

```
shared/config/config.default.ts    → appConfig (slug, domain, URLs, S3 settings)
shared/config/config.<mode>.ts     → per-mode overrides
        ↓
infra/config/engine-config.ts      → loads the app description the deploy needs
                                     (from `shared`, or the INFRA_CONFIG_MODULE
                                     module pointer in package mode)
        ↓
infra/config/*.config.ts           → app-owned sizing/feature knobs (VMs, DB, secrets map)
        ↓
infra/pulumi-context.ts            → stack identity + derived naming (the stack
                                     name IS the mode; APP_MODE derives from it)
        ↓
infra/resources/*.ts               → declare all resources from config + naming
        ↓
Pulumi.<stack>.yaml                → encryption salt + transient operator toggles only
```

No resource names, domains, bucket names, or sizing are hardcoded in Pulumi modules; everything flows from `appConfig` and `config/`.

### Stacks

One Pulumi stack per mode; the stack name IS the mode. The CLI takes `INFRA_MODE=<mode>` (or asks) and reads operator credentials from `infra/.env.<mode>` when present; the deploy command takes `--mode`.

### File structure

```text
infra/
├── boot/                   Boot runner container (first boot on every VM)
├── caddy/                  Frontend Caddy proxy image and config
├── cli/                    Infra CLI
├── compose/                Build and generate compose.gen.yml
├── config/                 App-owned config
├── lib/                    Shared utilities for resources and tasks
├── resources/              Pulumi resources: network, db, compute, LB ...
├── tasks/                  Non-interactive operator/CI tasks
├── tests/                  Infra tests

.github/workflows/
├── deploy.yml              Thin trigger: release published + manual dispatch
├── deploy-pipeline.yml     Reusable pipeline: setup, image builds, the deploy command
```

## Advanced operations

### Reset the database

Rebuilds the app's logical database from migrations plus the admin seed. **Pre-production only, or with services deliberately quiesced: a hard outage.** `pnpm infra` → **Reset database** takes a backup (aborting unless it reports ready), deletes and recreates the logical database over the Scaleway API with a bootstrap key, and re-grants both roles; it never exposes the database and never runs `pulumi up`. Then, on the serial console:

```bash
cd /opt/app
docker compose --profile backend run --rm backend-release
docker compose --profile backend run --rm -e ADMIN_EMAIL=you@example.com backend-release node dist/seeds-bundle.js init
```

Verify: `curl https://<your-app>/api/health?depth=full` reports every component `healthy`.

- **Nothing but you stops this.** Scaleway's API deletes a live database with connected clients and an active replication slot; the typed `<database>@<instance>` confirmation is the only guard.
- **Re-granting is mandatory, and the task owns it.** Deleting a database drops its Scaleway privileges; neither a recreate nor a backup restore brings them back (`pg_dump` carries table ACLs, not database-level ones), so without it `CONNECT` is absent and the app reports `database_unreachable`.
- **Pulumi is untouched.** Scaleway resource IDs are name-derived, so a same-name recreate keeps stack state correct.
- **The CDC worker needs no restart.** It re-ensures its replication slot on every retry.
- If the task fails after the delete, it prints the exact `scw rdb backup restore` command plus the two `privilege set` calls a restore does not perform.

### Updating the boot runner

The boot runner (`infra-boot`) is a registry container CI rebuilds per commit ([boot/Dockerfile](../infra/boot/Dockerfile)), so any change under [boot/](../infra/boot/) ships on the next deploy. Local build:

```bash
pnpm --filter infra boot:image   # tsup bundle + docker build (tag via BOOT_IMAGE)
```

Set `compute.image` to a literal image UUID only to pin a base image for rollback.

Renaming the boot image is sync-breaking with a built-in migration, because each generation pins its boot image by name and release sha and a digest is only pullable from its own repository:

- **Legacy-name resolution** ([lib/scaleway/boot-image.ts](../infra/lib/scaleway/boot-image.ts)): the current name first, then on 404 each name in `LEGACY_BOOT_IMAGE_NAMES`; the resolved name is threaded into cloud-init. Drop the legacy entry once no live generation predates the rename (one successful deploy per environment); first use was the 2026-07 `cella-boot` to `infra-boot` rename.
- **Pre-existing generations degrade.** A newly rolling generation must have a pinnable boot image (the deploy fails closed otherwise). A generation already live in control state carries `ignoreChanges` on cloud-init, so if its boot image is gone resolution degrades to an unpinned tag with a warning ([resources/compute.ts](../infra/resources/compute.ts)) rather than blocking the cutover.

### Key rotation

1. Generate a temporary bootstrap key (Personal API Key is fastest).
2. `pnpm infra` → **Rotate keys**: mints a fresh `<slug>-<mode>-ci-deploy` key and, if `gh` is authenticated, pushes it to the `production` GitHub Environment as `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`; the key is never written to stack config.

   ```bash
   pnpm infra
   ```

3. The next CI deploy uses the new key; no commit needed. VM-side keys need no rotation: every deploy mints fresh ones.
4. **Revoke the bootstrap key** in the Scaleway console.

### Passphrase rotation

`pnpm infra` → **Rotate passphrase**:

1. Verifies the current passphrase and generates a new one, shown once; store it first.
2. Re-encrypts the stack (`pulumi stack change-secrets-provider passphrase` rewrites the state object and `Pulumi.<stack>.yaml` with a fresh `encryptionsalt`) under the stack lock, and verifies the rewritten file decrypts with the new passphrase.
3. Syncs the new `PULUMI_CONFIG_PASSPHRASE` to the GitHub Environment (when `gh` is authenticated).
4. Reminds you to commit `infra/Pulumi.<stack>.yaml`.

No bootstrap key is needed: any key with state-bucket access works. A drifted or missing `PULUMI_CONFIG_PASSPHRASE` Environment secret needs no rotation: every **Resume**/**Rotate keys** run re-syncs it when `gh` is authenticated.

> Losing the current passphrase means existing secret outputs cannot be decrypted; there is no recovery. Actions secrets are write-only, so the GitHub copy keeps CI working but can never be viewed. Keep your password-manager copy current.

### Teardown

`pnpm infra` → **Teardown** deletes every resource to stop billing without holding owner-tier credentials ([Credentials](#credentials)): it prompts for a transient bootstrap-grade key (`SCW_TEARDOWN_*` env for unattended runs), requires typing `<slug>-<mode>`, runs `pulumi destroy --refresh` under the stack lock, then optionally deletes the stack's IAM principals. Production resources marked `protect: true` (frontend/private buckets, database) are refused unless protection is lifted in code first. Left in place on purpose: the versioned state bucket, operator secret values, and GitHub Environment secrets.

**Manual fallback (lost passphrase):** delete by hand in the console, in dependency order: load balancer (+IP) → instance (+volumes, +IP) → database → registry namespace → secrets → buckets (empty incl. versions, then delete; state bucket last) → private network → VPC → IAM apps/policies → DNS records → the now-empty project. The database and VPC need an owner or full-access key, not the CI key.

> **Clean slate** below is not a teardown: it resets stack tracking to re-bootstrap a still-running stack; live resources stay.

<a id="clean-slate"></a>

### Clean slate (start over from scratch)

1. `rm infra/Pulumi.<stack>.yaml`
2. (optional) Scaleway console → Object Storage → delete bucket `<slug>-pulumi-state` (names stay reserved for several hours).
3. (optional) Revoke the bootstrap API key in the Scaleway console.
4. (optional) Delete IAM application `<slug>-ci-deploy` and its policy.
5. (optional) Remove `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` from the `production` GitHub Environment.
6. Re-run: `pnpm infra`
