# Deployment

This document explains how a cella app deploys to European cloud provider [Scaleway](https://www.scaleway.com/): the resources that get provisioned, the release pipeline, and the operational tasks around it. The code lives in the [infra](../infra/) package; see its [README](../infra/README.md) for the product view and the shared [vocabulary](../infra/README.md#vocabulary).

### TL;DR

Publishing a release starts an automatic deployment. It creates new servers for that exact version,
checks them, moves traffic without downtime, and removes the old servers.
[Pulumi](https://www.pulumi.com/) manages the cloud resources and GitHub Actions triggers the deploy command.
Separate credentials are used for initial setup, automated deployment, and running servers, so
each stage has only the permissions it needs.

## Overview

The deployment setup is built around three principles:

1. **Create-then-replace.** A release and an infra change are the same operation: every deploy bakes the image SHA into a _new_ VM generation's cloud-init, brings it up, cuts traffic over, then reaps the old one.
2. **Descending-privilege credentials.** Keys descend in privilege (bootstrap → CI deploy → per-deploy VM keys), so no privileged key ever lives on your laptop. CI only holds what it needs.
3. **Automation without kubernetes.** IaC is great to organize semi-complex configurations without needing a DevOps expert. See also [config files](#configuration).

The key resources and how traffic flows between them:

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

- **Load balancer:** the single public entrypoint, and **dual-homed**: a public IP terminates TLS on one side, a private-network attachment forwards plain HTTP to VM private IPs on the other. The frontend (SPA proxy) is the default backend; backend, yjs and mcp are reached on the same app origin via registry-declared `pathPrefix` prefixes (`/api`, `/yjs`, `/mcp`). The LB never rewrites paths, so each service serves itself under its prefix.
- **Private network (VPC):** VMs and db connect over private IPs. Only the LB accepts inbound public traffic. Each VM keeps a public IP for egress (image pulls) but drops all inbound, including SSH.
- **Frontend:** a Caddy VM behind the LB that reverse-proxies the SPA bucket over its public S3 endpoint, adding security headers/CSP and the SPA deep-link fallback.
- **Backend VM:** the critical API path; replaced one generation at a time with LB overlap.
- **Worker VMs:** `cdc`, `yjs`, `mcp` each run on their own VM when enabled and `singleVm` is disabled; with `singleVm` on they are co-hosted on the backend VM and no separate worker VMs exist. `cdc` takes no LB route in either case: it is internal-only.
- **Database:** managed PostgreSQL reachable only from inside the private network (a break-glass toggle can temporarily expose it, see [Changing infrastructure](#changing-infrastructure)).
- **Buckets:** object storage sits outside the VPC and is reached over public S3 endpoints: browsers read the public upload bucket directly and use presigned URLs for the private one, the frontend Caddy proxies the SPA bucket, and the backend talks to S3 server-side.

## Deploy flow

The deployment lifecycle when a release publishes:

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

At runtime, the load balancer targets the host port published by the service's compose profile directly. The `frontend` service is itself a Caddy proxy image that serves the SPA bucket through the same VM/LB path as other services.

```
Scaleway LB ──▶ service VM host port ──▶ service container
```

The primary rollout service (the one that owns migrations) promotes first; the remaining services provision together and cut over concurrently. `cdc` has no public health endpoint; its replacement is confirmed indirectly by the primary public service coming up healthy.

**Rollback:** the old generation is reaped once the new one is healthy; nothing is left running for two generations per service. To roll back, commit a revert and redeploy: it follows the exact same forward path and recreates **every** service (including cdc, which is replaced in place and never retained), reusing the cached generation because the `genId` is content-addressed.

## Credentials

The security model is defined by Scaleway API keys in strictly descending privilege, each in a different store. Each key creates or provisions the next:

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
| **Bootstrap key** | Owner (via Personal API Key) **or** ProjectManager + IAMManager on a dedicated IAM application | Minutes: revoked immediately after each use (initial bootstrap or manual rotation). Also required for any `pulumi up` that touches bootstrap-owned modules (DB, VPC, private network). | Password manager only, never on disk |
| **CI deploy key** (`<slug>-ci-deploy`) | Write on compute / LB / edge / secrets / object storage / registry; **read-only** on VPC / private network / RDB (those are bootstrap-owned). Project-scoped, plus DNS at org scope. | Long-lived; rotate manually by re-running the CLI's **Rotate keys** action (see [Key rotation](#key-rotation)) | The `production` GitHub Environment secrets `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` (environment-scoped, not repo-scoped). The Scaleway provider authenticates from those env vars. |
| **Boot + service keys** (`<slug>-<mode>-boot`, `<slug>-<mode>-vm-<service>`) | Boot key: registry pull + boot-diag write + handoff-only secret read. Service key: path-conditioned secret read (its own + shared folders); the backend additionally gets granular S3 object sets. Just enough for a VM to pull images and hydrate `/opt/app/.env.runtime`. | Minted per deploy by the CI key; superseded keys are pruned on the next mint | Boot key baked into VM cloud-init; each service key delivered via a single-access handoff bundle in Secret Manager. Not in stack config. |

A fourth secret sits outside this chain: the **Pulumi passphrase**, which encrypts the stack's secret outputs in the state bucket. It is not an IAM identity: the CLI generates it at bootstrap and syncs it to the GitHub Environment; your only job is storing it in your password manager when shown (see [Passphrase rotation](#passphrase-rotation)).

## CI deploys

The workflow at [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) is a thin trigger (push to main, release, and manual dispatch) that calls the reusable pipeline in [.github/workflows/deploy-pipeline.yml](../.github/workflows/deploy-pipeline.yml). Inside the reusable workflow, a `setup` job derives names/matrices from config, a build matrix pushes images, and one `deploy` job runs the whole deployment as a single command:

```
pnpm --filter infra run deploy --mode <staging|production> --sha <sha> --git-ref <ref>
```

[tasks/deploy-run.ts](../infra/tasks/deploy-run.ts) (entered via the thin [tasks/deploy.ts](../infra/tasks/deploy.ts) loader) owns everything after the image builds: preflights, the stack lock (released in `finally`), the frontend build and hashed-asset upload (concurrent with the wait for image tags), the base stack update, the waved rollout, public version verification, the atomic frontend entry publish, smoke checks, and boot diagnostics on failure. Any CI system (or an operator shell) with the SCW_* credentials runs the same command.

The rollout records the release SHA as INTENT (`pendingSha`) in the S3 control object and lets the Pulumi program, the sole authority over generation identity, provision a **new VM generation** (`vm-<svc>-<genId>`) with the SHA baked into its cloud-init. The `genId` is **content-addressed** (a hash of the release SHA plus the generation's static config), so re-running a deploy reuses the same generation (a true no-op) and a manual `pulumi up` can never create a divergent generation identity. For LB-backed services the cutover expands the LB backend to `[old,new]`, waits until the public `/health` can serve the expected `X-App-Version`, then contracts to `[new]`; displaced generations are reaped by one final stack update after every cutover succeeded (rollback = revert commit + redeploy). See [rollout strategies](#rollout-strategies) for the model.

Pushes to main auto-deploy **staging**, so staging always mirrors the tip of main. An app built from the template must bootstrap a `staging` [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) holding the `SCW_*` secrets before merging to main, or the push job fails. A burst of merges coalesces: the newest push cancels a superseded in-flight staging run (`cancel-in-progress`), and production rollouts never cancel. You can also deploy staging on demand: GitHub → Actions → Deploy → Run workflow → select `staging`.

**Production** deploys only when a release is published (or a manual dispatch). To make it a manual promote, configure a [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) named `production` with required reviewers: the deploy job already targets that Environment, so the run pauses for an approval click before touching production.

### Bring your own CI

GitHub Actions is only the default trigger; the whole release is ONE command on any runner:

1. **Env**: export `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_DEFAULT_PROJECT_ID`, `SCW_DEFAULT_ORGANIZATION_ID`, `PULUMI_CONFIG_PASSPHRASE` (the same five values the GitHub Environment holds; the workflow maps its `SCW_PROJECT_ID` / `SCW_ORGANIZATION_ID` secrets onto the `SCW_DEFAULT_*` names the Scaleway provider reads). Install node + pnpm + docker (with buildx) + the pulumi CLI.
2. **Deploy**: `pnpm --filter infra run deploy --mode <mode> --sha <sha> --build`. The `--build` flag bakes and pushes every image (app services + boot runner) via `docker buildx bake` with a registry-backed build cache shared with CI; the command also builds the frontend and uploads its hashed assets itself. Safe to re-run; the stack lock serializes concurrent attempts.

On GitHub Actions the reusable workflow builds images as a parallel matrix (faster on cold caches) and omits `--build`; both paths share the same `:buildcache` registry cache. A prebuilt frontend can be supplied with `--dist <dir>` to skip the in-command build. The deploy command needs no GitHub-specific context; `--git-ref` only gates production deploys to main/release refs when provided.

## Rollout strategies

Every deploy is a **create-then-replace**: the image SHA is baked into a new VM generation's cloud-init, so a release and an infra change flow through one path. Each service declares its replacement strategy in the app-owned registry ([config/services.config.ts](../infra/config/services.config.ts)).

| `replacementStrategy` | Services | How |
| --- | --- | --- |
| **start-first** | backend, frontend, yjs, mcp | Record the SHA as `pendingSha`; the Pulumi program provisions the content-addressed pending generation alongside the active one. [tasks/cutover.ts](../infra/tasks/cutover.ts) then reconciles the live LB server list toward the desired state with idempotent Scaleway `SetBackendServers` calls: expand to `[old,new]`, health/version-gate through the public LB, contract to `[new]`, drain. It re-reads live state and always issues the corrective call, so an empty or stale pool (or a same-generation redeploy) is repaired rather than assumed correct. The new generation is promoted to `active`; every displaced generation is reaped by ONE final stack update after all cutovers succeeded. No generation is retained, so a deploy never runs two VMs per service beyond the overlap window. |
| **stop-first** | cdc | No LB overlap: cdc holds one Postgres replication slot. The Pulumi program provisions only the new generation (the old one is replaced in the same `up`); the new worker contends for the slot the old one releases on drain (handoff is lossless: the slot retains the WAL position). |

Under **`singleVM`** the host service inherits that: folding a stop-first worker onto the backend's VM makes the backend effectively stop-first, since the one VM is replaced in place. Its plan is marked `exclusive` ([tasks/rollout-plans.ts](../infra/tasks/rollout-plans.ts)) — `drainSeconds` 0, no old IPs — so the cutover health-gates and then points the LB pool straight at the new generation. Create-then-replace still holds for the *generation*; what is lost is the overlap, and with it zero-downtime on that host. Split-VM (the default, and what cella runs) is unaffected.

**`drainPolicy`** tunes how the old generation leaves the LB: `requests` (HTTP; `onMarkedDownAction: none`, in-flight requests finish) for backend/frontend/mcp, or `reconnect` (WebSocket; sessions shed, clients re-dial and resync from durable state) for yjs.

[tasks/rollout.ts](../infra/tasks/rollout.ts) sequences the cutovers into a **two-wave rollout** over an injected runtime: wave 1 provisions and promotes the primary service alone; wave 2 records `pendingSha` for every remaining service in the **S3 control object** (`control/<stack>.json` in the state bucket, the source of truth the Pulumi program reads), provisions all their generations in one stack update, health-gates and cuts each over concurrently, and one final update reaps every displaced generation. Internal consumers reach a service through the LB's ACL-guarded **internal route** with `@{<svc>.internalHost}:@{<svc>.internalPort}`, a stable address that follows every cutover; `@{<svc>.privateIp}` still resolves a same-stack generation IP baked at deploy time. A frontend **content** release is just an S3 upload (no VM cutover); only a Caddy/CSP/cloud-init change replaces the frontend VM.

### Runtime secret delivery

Runtime secrets reach a VM through `/opt/app/.env.runtime`, a docker-compose `env_file` that the on-VM boot runner writes from Secret Manager at boot. Because an `env_file` is line-based, **every secret value must be a single line**. Multi-line values (e.g. a PEM certificate) must be stored **base64-encoded** and decoded by the consuming service. This is what `DATABASE_SSL_CA` does (encoded in [resources/secrets.ts](../infra/resources/secrets.ts), decoded in the db clients). A `required` secret that can't be delivered fails the hydration, which by design blocks the service from booting rather than letting it crash-loop behind a 502.

Two safeguards keep a runtime-secret change from causing the kind of full outage a mis-delivered secret would otherwise trigger. They sit alongside the single-line/base64 contract above:

1. **The secret _manifest_ is baked into the new generation's cloud-init.** The per-service manifest (the list of which secrets a VM hydrates; metadata only, never values) is built by Pulumi ([resources/compute.ts](../infra/resources/compute.ts)) and written into cloud-init. Because every deploy already replaces the VM, there is no out-of-band channel to maintain; at first boot the boot runner reads the manifest and hydrates `/opt/app/.env.runtime` before the app starts.
2. **Deliverability is preflighted before rolling.** Right after the base stack update, and before any VM is rolled or replaced, the deploy asserts that every `required` secret can actually be hydrated the way a VM will (fetched from Secret Manager and single-line / decodable), failing loudly with the offending env vars instead of bricking the fleet ([tasks/assert-secrets-deliverable.ts](../infra/tasks/assert-secrets-deliverable.ts), the **Verify runtime secrets are deliverable** step, next to the **Verify VM IAM grants** preflight). The single-line rule itself lives in one place, [lib/utils/env-file.ts](../infra/lib/utils/env-file.ts), shared by the preflight and the on-VM boot runner that performs the hydration.

### Certificate issuance and recovery

A new service's DNS record must propagate before Scaleway requests its Let's Encrypt certificate. Otherwise ACME resolvers can see `NXDOMAIN`, leaving a terminally errored certificate that Scaleway does not retry. [`DnsPropagationGate`](../infra/resources/dns-cert-gates.ts) waits for public resolvers to return the load balancer IP before certificate creation; `CertReadyGate` then surfaces ACME failure details and delays frontend attachment until the certificate is ready. Both gates are create-only.

The deploy runs [`repair-certs.ts`](../infra/tasks/repair-certs.ts) before the base stack update. It removes terminally errored certificates from Pulumi state and then from Scaleway so the gated issuance pipeline can run again. State deletion happens first: a dependent frontend makes Pulumi refuse the deletion, which preserves TLS material still in use. Operators can run the same repair with `pnpm --filter infra repair-certs --stack <stack>`.

## Configuration

All tunable infra config lives in committed, type-checked files under [config/](../infra/config). Edit a value there and deploy. Each field is either a single value or a per-mode map (`{ production: …, staging: … }`).

**Common questions:**

- _Where do I change a VM size?_ → `instanceType` in [config/services.config.ts](../infra/config/services.config.ts) (applied by the next CI deploy).
- _Where do I change the database size?_ → DB node type & volume in [config/general.config.ts](../infra/config/general.config.ts) (bootstrap-owned RDB; apply via [Changing infrastructure](#changing-infrastructure)).

| File | Owns | Applied by |
| --- | --- | --- |
| [config/services.config.ts](../infra/config/services.config.ts) | Per-service VM size (`instanceType`, required), replacement strategy, drain policy, LB routing, env, feature flags | routine CI deploy |
| [config/general.config.ts](../infra/config/general.config.ts) | DB node type & volume, asset retention | DB fields via CLI **Apply infra change** (bootstrap-owned RDB); the rest via routine CI deploy |
| [config/runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts) | Which services receive each runtime secret | routine CI deploy |

What stays in Pulumi config (not committed app data): the encryption salt, the transient DB public-endpoint break-glass toggle (`infra:dbPublicEndpoint` / `infra:dbPublicAcl`), and the bootstrap `computeDeferred` lifecycle marker. Per-service rollout state (generation + image SHA) lives in the **S3 control object** (`control/<stack>.json` in the state bucket), not in committed config: written by the deploy around each cutover and read by the Pulumi program at plan time. A conditional-write lock (`control/<stack>.lock.json`) prevents a CI deploy and an operator `apply` from mutating the same stack concurrently; clear a stale lock with the CLI **Unlock** action.

## Changing infrastructure

Most config changes ship through a normal CI deploy. But **bootstrap-owned** resources (the database, VPC, and private network) can only be mutated with a temporary bootstrap key.

To apply a bootstrap-owned change (e.g. resize the database), run the CLI (`pnpm infra`) and pick **Apply infra change**. The action:

1. Prompts for the Pulumi passphrase and a fresh bootstrap key (broad permissions, see [Generate a bootstrap API key](#2-generate-a-bootstrap-api-key)).
2. Supplies that key to the Scaleway provider via `SCW_*` env (it is never written to stack config).
3. Runs `pulumi up` against the already-bootstrapped stack. Compute stays up: unlike the fresh-provision flow, Apply infra change does **not** set the `bootstrap:computeDeferred` marker, so the running VMs/LB are left in place.
4. Reminds you to revoke the bootstrap key.

> **Upgrading from the legacy IAM model (v1):** the engine now assumes the per-service IAM model (v2) unconditionally; the migration tooling has been removed. A stack still on the legacy single vm-reader model must first run `pnpm infra` → **Migrate IAM model** (migrate, deploy, then clean up legacy principals) from a checkout *prior* to this change before syncing past it.

## Fresh installation

The interactive CLI ([cli/infra-cli.ts](../infra/cli/infra-cli.ts)) is launched with `pnpm infra`. It inspects the local `Pulumi.<stack>.yaml` to decide whether this is the start of a fresh installation or to manage an existing setup. On a fresh stack it skips the menu and runs a fresh install directly.

A fresh install defaults to **staging**: the cheapest footprint, seedable, and disposable, so you validate the full pipeline before committing to production. Setting up production later is the same wizard, re-run with `pnpm infra --mode production`.

Two flags control prompting. `--defaults` takes every optional default without asking, still prompting for the genuinely required inputs (bootstrap key, admin email): the interactive fast path. `INFRA_NON_INTERACTIVE=1` is for unattended automation: it also takes optional defaults, but a required input with no environment value fails instead of prompting. Run `pnpm --filter infra status` at any point to see the current state and the next action to take.

### 1. Prerequisites

- **A domain.** You need an external domain (set as `appConfig.domain`) set up through: https://console.scaleway.com/domains/external.
- **Pulumi.** Install the CLI:

  ```bash
  brew install pulumi/tap/pulumi
  ```

- **GitHub CLI** (recommended). If you want bootstrap to create the GitHub Environment and sync the CI deploy secrets automatically, install `gh` and authenticate it first with `gh auth login`.
- **Docker** (recommended). With docker (and its buildx plugin) available, the wizard can end by running the first deploy from your machine, so setup finishes with a live app instead of a wait for CI.
- **Scaleway Project** (optional). If `SCW_PROJECT_ID` is not in `backend/.env`, the wizard lists your organization's projects to pick from, or creates one named after the app slug, and writes the id back to `backend/.env`. Creating one by hand in the [Scaleway console](https://console.scaleway.com/) still works.

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

- Picks or creates the Scaleway project when `SCW_PROJECT_ID` is not set yet (written back to `backend/.env`)
- Generates the Pulumi passphrase. **Store it when shown**; it is shown only once and unrecoverable if lost (set `PULUMI_CONFIG_PASSPHRASE` before running to supply your own)
- Creates state storage
- Initializes Pulumi
- Creates required credentials
- Configures GitHub (if available)
- Optionally runs the first pulumi up (base infra: registry, DB, network; no compute yet)
- Offers to run the **first deploy** right there: the same one-command deploy CI runs, with `--build` so images are baked locally, authenticated with the freshly minted CI deploy key. Accepting ends setup with a live app; declining leaves the CI path (step 5)
- Offers to **revoke the bootstrap key** as its last call, so no privileged credential outlives the session

### 4. Compute base image

Service VMs boot from Scaleway's stock **`docker`** marketplace image (Docker Engine + the Compose plugin, preinstalled and current), set as `compute.image` in [config/general.config.ts](../infra/config/general.config.ts) and passed straight to the instance. There is **no image bake**: the boot runner ships as a normal registry container (`infra-boot`, built from [boot/Dockerfile](../infra/boot/Dockerfile)) that CI builds and pushes per commit, and every VM `docker run`s it at first boot (mounting the host Docker socket) to bring its compose stack up. Cloud-init shrinks to a launcher that writes the boot plan, logs the host into the registry, and runs the boot runner container; the boot runner owns the boot state machine (compose/env files, runtime-secret hydration, image pull, migrate, app start).

Set `compute.image` to a literal image UUID only to **pin** a specific base image for rollback.

### 5. Commit and push

Commit the updated `infra/Pulumi.<mode>.yaml` and push. If you accepted the wizard's first deploy, the app is already live and this push simply hands routine releases to CI. If you declined it, CI's first run builds and pushes the Docker images, runs the deploy command, and brings the compute VMs up.

The local wizard steps do **not** depend on GitHub secrets, but CI runs do. If they're missing, the CI step fails and the VMs will not come up.

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

The wizard offers to revoke the key itself as its final step; accepting covers this section. If you declined (or the revoke failed):

1. Go to [IAM → API Keys](https://console.scaleway.com/iam/api-keys) and delete the bootstrap key.
2. Optionally delete the temporary bootstrap application too.

After bootstrap, only the long-lived deploy and VM keys should remain. From here on, **all routine deploys happen in CI**.

### 7. Sign in as the first admin

A fresh database has **no users**, but no manual seeding is needed: the one-shot `backend-release` companion (cella's migrate step) that runs before the app on every new generation also seeds a single admin user when the users table is empty ([backend/src/main.migrate.ts](../backend/src/main.migrate.ts), idempotent). It uses the **required** `admin-email` runtime secret (`ADMIN_EMAIL`), which the wizard prompts for at setup; the deploy preflight refuses to roll anything while it is missing, so a completed deploy implies the admin exists.

After the first successful deploy:

1. Open the app and request a magic link for the admin email.
2. Sign in. Working outbound email is required, so seed the Brevo API key (or your app's email provider credentials) via **Manage runtime secrets** if magic links do not arrive.

**Fallback: seed by hand.** If you need to (re)seed outside the boot path, the backend image ships a bundled, production-safe seed runner ([backend/scripts/seeds-bundle.ts](../backend/scripts/seeds-bundle.ts)). Run it on a VM via the serial console (open a backend instance in the [Scaleway console](https://console.scaleway.com/instance/servers) → **Console**, log in with the root password shown on the instance page):

```bash
cd /opt/app
docker compose --profile backend run --rm -e ADMIN_EMAIL=you@example.com backend-release node dist/seeds-bundle.js init
```

This reuses the `backend-release` companion's image and `.env`/`.env.runtime` (which carry `DATABASE_ADMIN_URL`), overriding only the command to run the seed bundle.

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

These two flows are general-purpose break-glass for any scoped operator task against the live database (data inspection, one-off migrations, debugging), not only seeding. For staging, the CLI also offers a one-flow **Seed database** action that exposes, seeds, and closes in one go (it refuses production).

## Architecture reference

### Layers

The infrastructure is organised in 6 phases, deployed in dependency order ([index.ts](../infra/index.ts) composes the modules):

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

No resource names, domains, bucket names, or sizing are hardcoded in the Pulumi modules. Everything flows from `appConfig` and the `config/` files.

### Stacks

One Pulumi stack per mode, and the stack name IS the mode: `production` and `staging` are supported out of the box. The CLI targets a mode via `INFRA_MODE=<mode>` (or interactively) and reads operator credentials from `infra/.env.<mode>` when present; the deploy command takes `--mode`. All per-service rollout state lives in the control object, not in extra stacks.

### File structure

```text
infra/
├── boot/                   Boot runner: the container every VM runs at first boot
├── caddy/                  Frontend Caddy proxy image and config
├── cli/                    Infra CLI
├── compose/                Build and generate compose.gen.yml
├── config/                 Where customisable config lives
├── lib/                    Shared infra utilities used across Pulumi resources and tasks
├── resources/              Pulumi resources: network, db, compute, LB ...
├── tasks/                  Non-interactive operator/CI tasks (key setup, verification, waits)
├── tests/                  Higher-level infra test coverage

.github/workflows/
├── deploy.yml              Thin trigger: release published + manual dispatch
├── deploy-pipeline.yml     Reusable pipeline: setup, image builds, the deploy command
```

The workflows are tightly coupled to this package: `deploy-pipeline.yml` builds the release images in a matrix, then hands everything else to the single deploy command (authenticating with the CI deploy key).

## Advanced operations

### Reset the database

Wipes the app's logical database and rebuilds it from migrations + the admin seed. For large rewrites, where replaying migration history is not worth it and a clean baseline is. **Pre-production, or with services deliberately quiesced: this is a hard outage.**

Run the CLI (`pnpm infra`) and pick **Reset database**. It takes a backup (aborting unless it reports ready), deletes and recreates the logical database over the Scaleway API with a bootstrap key, and re-grants both roles. It never exposes the database and never runs `pulumi up`.

Then run the two steps it prints, on the serial console:

```bash
cd /opt/app
docker compose --profile backend run --rm backend-release
docker compose --profile backend run --rm -e ADMIN_EMAIL=you@example.com backend-release node dist/seeds-bundle.js init
```

Confirm with `curl https://<your-app>/api/health?depth=full`: all components `healthy`.

Four things are worth understanding before running it:

- **Nothing but you stops this.** Scaleway's API deletes a live database with connected clients and an active replication slot; PostgreSQL alone refuses that. Maintenance mode is a convention here, not an interlock; the typed `<database>@<instance>` confirmation is the guard.
- **Re-granting is mandatory, and the task owns it.** Deleting a database drops its Scaleway privileges, and neither a recreate nor a _backup restore_ brings them back: a per-database `pg_dump` carries table ACLs but not database-level ones, so `CONNECT` is absent and the app reports `database_unreachable`.
- **Pulumi is untouched.** Scaleway's resource IDs are name-derived, so a same-name recreate yields identical IDs and stack state stays correct. No `pulumi up`, no secret churn, no VM roll.
- **The CDC worker needs no restart.** It re-ensures its replication slot on every retry.

If the task fails after the delete, it prints the exact `scw rdb backup restore` command plus the two `privilege set` calls a restore does not perform.

### Updating the boot runner

The boot runner is a normal registry container, not a baked base image. CI rebuilds and pushes it per commit ([boot/Dockerfile](../infra/boot/Dockerfile)), so any change under [boot/](../infra/boot/) ships on the next deploy with no extra step. To build it locally:

```bash
pnpm --filter infra boot:image   # tsup bundle + docker build (tag via BOOT_IMAGE)
```

The VM base image itself is the stock `docker` marketplace label (`compute.image`); set it to a literal image UUID only to **pin** a specific base for rollback.

Renaming the boot image is a sync-breaking change with a built-in migration, and pinning tolerates a pre-existing generation whose boot image is gone. Each VM generation pins its boot image by name and release sha, and a manifest digest is only pullable from its own repository, so a generation deployed under an older name has its boot image only in the legacy repository. Two mechanisms keep a deploy planning:

- **Legacy-name resolution.** When resolving a generation's boot image ([lib/scaleway/boot-image.ts](../infra/lib/scaleway/boot-image.ts)), the current name is tried first and, on a 404, each name in `LEGACY_BOOT_IMAGE_NAMES` in turn; the resolved name is threaded into cloud-init so the ref points at the repository the digest lives in. Drop the legacy entry once no live generation predates the rename, which is one successful deploy per environment. The 2026-07 `cella-boot` to `infra-boot` rename is the first use.
- **Pre-existing generations degrade.** A newly rolling generation must have a pinnable boot image (the deploy fails closed otherwise). A generation already live in the control state has its VM booted and carries `ignoreChanges` on cloud-init, so if its boot image is no longer resolvable at all (for example the registry pruned the old tag) resolution degrades to an unpinned tag with a warning ([resources/compute.ts](../infra/resources/compute.ts)) rather than blocking the cutover to the new generation.

### Key rotation

1. Generate a temporary bootstrap key. Personal API Key is fastest.

2. Run the CLI and pick **Rotate keys**:

   ```bash
   pnpm infra
   ```

   This mints a fresh `<slug>-<mode>-ci-deploy` key and (if `gh` is authenticated) pushes it to the `production` GitHub Environment as `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`. The key is not written to stack config.

3. The next CI deploy authenticates with the new CI key from the GitHub Environment; no commit needed. VM-side credentials need no rotation of their own: every deploy mints fresh boot + service keys.

4. **Revoke the bootstrap key** in the Scaleway console.

### Passphrase rotation

The Pulumi passphrase encrypts the stack's secret outputs (e.g. the DB connection string) in the state bucket. To rotate it, run the CLI (`pnpm infra`) and pick **Rotate passphrase**. The action:

1. Verifies the current passphrase, then generates a new one, shown once; store it in your password manager before the rotation runs.
2. Re-encrypts the stack (`pulumi stack change-secrets-provider passphrase` rewrites both the state object and `Pulumi.<stack>.yaml` with a fresh `encryptionsalt`), under the stack lock so a concurrent CI deploy cannot read state mid-rotation, and verifies the rewritten file decrypts with the new passphrase.
3. Syncs the new `PULUMI_CONFIG_PASSPHRASE` to the GitHub Environment (when `gh` is authenticated).
4. Reminds you to commit the updated `infra/Pulumi.<stack>.yaml`.

Unlike **Rotate keys**, no bootstrap key is needed: nothing changes on the Scaleway side, so any key with state-bucket access works (CI deploy key or an operator key). A drifted or missing `PULUMI_CONFIG_PASSPHRASE` Environment secret can also be repaired without rotating: every `pnpm infra` **Resume**/**Rotate keys** run re-syncs the verified passphrase when `gh` is authenticated.

> Losing the current passphrase means you cannot decrypt existing secret outputs; there is no recovery. The GitHub Environment holds a copy, but Actions secrets are write-only: CI keeps working with it, yet it can never be viewed again, so keep your password-manager copy current.

### Teardown

Decommissioning a stack — deleting every resource to stop billing — is the CLI's **Teardown** action. It never *holds* owner-tier credentials (the [descending-privilege model](#credentials) keeps those off laptops and out of CI): it prompts for a transient bootstrap-grade key (`SCW_TEARDOWN_*` env for unattended runs), requires typing `<slug>-<mode>`, runs `pulumi destroy --refresh` under the stack lock, and then optionally deletes the stack's IAM principals. Production resources marked `protect: true` (frontend/private buckets, database) are refused unless protection is deliberately lifted in code first — that refusal is the point. The versioned state bucket, operator secret values, and GitHub Environment secrets are deliberately left in place.

**Manual fallback (lost passphrase):** `pulumi destroy` is unavailable once the passphrase is gone — then you delete by hand in the Scaleway console, in dependency order: load balancer (+IP) → instance (+volumes, +IP) → database → registry namespace → secrets → buckets (empty incl. versions, then delete; state bucket last) → private network → VPC → IAM apps/policies → DNS records → the now-empty project. The database and VPC need an owner or full-access key, not the CI key.

> **Clean slate** below is *not* a teardown — it resets stack tracking to re-bootstrap a still-running stack, and leaves live resources in place.

<a id="clean-slate"></a>

### Clean slate (start over from scratch)

1. `rm infra/Pulumi.<stack>.yaml`
2. (optional) Scaleway console → Object Storage → delete bucket `<slug>-pulumi-state`. Note: Scaleway reserves bucket names for several hours after deletion.
3. (optional) Revoke the bootstrap API key in the Scaleway console.
4. (optional) Delete IAM application `<slug>-ci-deploy` and its policy.
5. (optional) Remove `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` from the `production` GitHub Environment (Settings → Environments → production → Environment secrets).
6. Re-run: `pnpm infra`
