# Deployment

This document explains how a cella app deploys to European cloud provider [Scaleway](https://www.scaleway.com/) using the the [Infra CLI](../infra/README.md).

### TL;DR

Publishing a release starts an automatic deployment. It creates new servers for that exact version,
checks them, moves traffic without downtime, and removes the old servers.
[Pulumi](https://www.pulumi.com/) manages the cloud resources and GitHub Actions triggers the deploy command.
Separate credentials are used for initial setup, automated deployment, and running servers, so
each stage has only the permissions it needs.

## Overview

Three principles ([infra/README.md](../infra/README.md#core-philosophy)): **create-then-replace** (a new VM generation per deploy, cut over, old one reaped), **content-addressed identity** (a generation is named by what it runs), and **least-privilege credentials**. Resources and traffic flow:

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
 │           │             │  │             │ │  VM when singleVM)       │ │
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

- **Load balancer:** the only public entrypoint. Backend, yjs and mcp share the app origin via registry-declared `pathPrefix` values (`/api`, `/yjs`, `/mcp`). The LB never rewrites paths. `cdc` never takes an LB route.
- **VMs:** public IP for egress only (image pulls). All inbound is dropped, including SSH. Every service gets its own VM unless `singleVM` co-hosts the workers and the frontend Caddy container on the backend VM.
- **Frontend VM:** Caddy adds security headers/CSP and the SPA deep-link fallback.
- **Database:** private-network only. A break-glass toggle can expose it temporarily ([Changing infrastructure](#changing-infrastructure)).
- **Buckets:** outside the VPC. Browsers read the public upload bucket directly and use presigned URLs for the private one.

## Deploy flow

```
Release published, push to main (staging), or manual dispatch
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
(degraded components warn with an annotation, unhealthy ones fail the run)
        ↓
One final stack update reaps every displaced generation
(CI passes `--defer-reap` and runs that update as a follow-up `reap` job)
```

The primary service owns migrations. `cdc` has no public health endpoint. Its replacement is confirmed by the primary public service coming up healthy.

**Rollback:** nothing is retained for two generations. Commit a revert and redeploy: same forward path, every service recreated (cdc in place), cached generation reused because `genId` is content-addressed.

## Credentials

Scaleway API keys descend in privilege, each in a different store, each minting the next.

| Key | Permissions | Lifetime | Where stored |
| --- | --- | --- | --- |
| **Bootstrap key** | Owner (via Personal API Key) **or** ProjectManager + IAMManager on a dedicated IAM application | Minutes: revoked after each use. Required for any `pulumi up` that touches bootstrap-owned modules (DB, VPC, private network). | Password manager only, never on disk |
| **CI deploy key** (`<slug>-<mode>-ci-deploy`) | Write on compute / LB / private networks / edge / secrets / object storage / registry / DNS. **Read-only** on VPC and RDB (those are bootstrap-owned). Project-scoped. | Long-lived. Rotate via the CLI **Rotate keys** action ([Key rotation](#key-rotation)) | The stack's GitHub Environment (`staging` or `production`) secrets `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`. |
| **Boot + service keys** (`<slug>-<mode>-boot`, `<slug>-<mode>-vm-<service>`) | Boot key: registry pull + boot-diag write + handoff-only secret read. Service key: path-conditioned secret read (its own + shared folders). The backend additionally gets granular S3 object sets. | Minted per deploy by the CI key. Superseded keys are pruned on the next mint | Boot key baked into VM cloud-init. Each service key is delivered via a single-access handoff bundle in Secret Manager. Not in stack config. |

The **Pulumi passphrase** sits outside the chain: it encrypts the stack's secret outputs in the state bucket ([Passphrase rotation](#passphrase-rotation)).

## CI deploys

[.github/workflows/deploy.yml](../.github/workflows/deploy.yml) is a thin trigger (push to main, release published, manual dispatch) for the reusable [.github/workflows/deploy-pipeline.yml](../.github/workflows/deploy-pipeline.yml): `setup` derives names and matrices from config, a build matrix pushes images, and one `deploy` job runs a single command:

```
pnpm --filter infra run deploy --mode <staging|production> --sha <sha> --git-ref <ref>
```

- Pushes to main auto-deploy **staging**. Bootstrap a `staging` [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) holding the `SCW_*` secrets before merging to main. Until `Pulumi.staging.yaml` carries the bootstrap marker, the deploy job is skipped. The newest push cancels a superseded in-flight staging run (`cancel-in-progress`). Production rollouts never cancel. Manual: Actions → Deploy → Run workflow → `staging`.
- **Production** deploys only on a published release or a manual dispatch. For a manual promote, give the `production` GitHub Environment required reviewers. The run then pauses for approval.

### Bring your own CI

1. **Env**: export `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_DEFAULT_PROJECT_ID`, `SCW_DEFAULT_ORGANIZATION_ID`, `PULUMI_CONFIG_PASSPHRASE` (the workflow maps its `SCW_PROJECT_ID` / `SCW_ORGANIZATION_ID` secrets onto the `SCW_DEFAULT_*` names the Scaleway provider reads). Install node, pnpm, docker (buildx), and the pulumi CLI.
2. **Deploy**: `pnpm --filter infra run deploy --mode <mode> --sha <sha> --build`. `--build` bakes and pushes every image (app services + boot runner) via `docker buildx bake` with the registry `:buildcache` shared with CI. Safe to re-run. The stack lock serializes concurrent attempts.

GitHub Actions builds images as a parallel matrix and omits `--build`. `--dist <dir>` supplies a prebuilt frontend. `--git-ref`, when provided, gates production deploys to main/release refs.

## Rollout strategies

Each service declares its `replacementStrategy` in [config/services.config.ts](../infra/config/services.config.ts).

| Strategy | When | Behavior | Downtime |
| --- | --- | --- | --- |
| **start-first** | backend, frontend, yjs, mcp (LB-backed) | Pulumi provisions the pending generation (`vm-<svc>-<genId>`) next to the active one. [tasks/cutover.ts](../infra/tasks/cutover.ts) reconciles the live LB server list with idempotent `SetBackendServers` calls: expand to `[old,new]`, health/version-gate through the public LB, contract to `[new]`, drain. It always issues the corrective call, so an empty or stale pool is repaired. | None (LB overlap). |
| **stop-first** | cdc (holds one Postgres replication slot) | Pulumi provisions only the new generation, replacing the old in the same `up`. The new worker takes the slot the old one releases on drain (lossless: the slot retains the WAL position). | Worker gap during replacement. |
| **exclusive** (`singleVM`) | the backend VM when it hosts a stop-first worker | Plan marked `exclusive` in [tasks/rollout-plans.ts](../infra/tasks/rollout-plans.ts): `drainSeconds` 0, no old IPs. The cutover health-gates, then points the LB pool straight at the new generation. | Yes, on that host. Split-VM (the default) is unaffected. |

### Runtime secret delivery

Runtime secrets reach a VM through `/opt/app/.env.runtime`, a docker-compose `env_file` the boot runner writes from Secret Manager at boot.

- **Every secret value must be a single line** (an `env_file` is line-based). Store multi-line values such as a PEM certificate **base64-encoded** and decode them in the consuming service, as `DATABASE_SSL_CA` does (encoded by the postgres store in [resources/stores/postgres-managed.ts](../infra/resources/stores/postgres-managed.ts), decoded in the db clients). The rule lives in [lib/utils/env-file.ts](../infra/lib/utils/env-file.ts), shared by the preflight and the boot runner.
- An undeliverable `required` secret fails hydration and blocks boot, rather than crash-looping behind a 502.

### Certificate issuance and recovery

Certificate issuance waits for the new DNS record to propagate ([dns-cert-gates.ts](../infra/resources/dns-cert-gates.ts)), and every deploy first runs [repair-certs.ts](../infra/tasks/repair-certs.ts) to clear terminally errored certificates. Manual run: `pnpm --filter infra repair-certs --stack <stack>`.

## Configuration

All tunable infra config lives in committed, type-checked files under [config/](../infra/config). Edit and deploy. Each field is a single value or a per-mode map (`{ production: …, staging: … }`).

| File | Owns | Applied by |
| --- | --- | --- |
| [config/services.config.ts](../infra/config/services.config.ts) | Per-service VM size (`instanceType`, required), replacement strategy, drain policy, LB routing, env. Which services exist comes from `appConfig.services.<name>.enabled` | routine CI deploy |
| [config/general.config.ts](../infra/config/general.config.ts) | DB node type & volume, asset retention | DB fields via CLI **Apply infra change** (bootstrap-owned RDB). The rest via routine CI deploy |
| [config/runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts) | Which services receive each runtime secret | routine CI deploy |

## Changing infrastructure

Most config changes ship through a normal CI deploy. **Bootstrap-owned** resources (database, VPC) can only be mutated with a temporary bootstrap key: `pnpm infra` → **Apply infra change**, which:

1. Reads the Pulumi passphrase and a fresh bootstrap key from `PULUMI_CONFIG_PASSPHRASE` and `SCW_BOOTSTRAP_ACCESS_KEY` / `SCW_BOOTSTRAP_SECRET_KEY`, prompting for whatever is missing ([Generate a bootstrap API key](#2-generate-a-bootstrap-api-key)).
2. Passes the key to the Scaleway provider via `SCW_*` env. It is never written to stack config.
3. Runs `pulumi up` against the bootstrapped stack without setting `bootstrap:computeDeferred`, so the running VMs and LB stay in place.
4. Reminds you to revoke the bootstrap key.

## Fresh installation

`pnpm infra` launches the CLI ([cli/infra-cli.ts](../infra/cli/infra-cli.ts)). Without a local `Pulumi.<stack>.yaml` it runs the install wizard. A fresh install defaults to **staging**. Production is the same wizard via `pnpm infra --mode production`. `--defaults` takes every optional default and prompts only for required inputs (bootstrap key, admin email). `INFRA_NON_INTERACTIVE=1` also takes the defaults but fails on a required input with no environment value. `pnpm --filter infra status` shows the current state and next action.

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

1. Easiest: as an organization Owner, generate a [Personal API Key](https://console.scaleway.com/iam/users) (User menu → API keys → Generate).
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
6. Optionally runs the first `pulumi up` (registry, DB, and network, but no compute yet).
7. Offers the **first deploy** (the CI command with `--build`, using the new CI deploy key). Accepting ends with a live app. Declining leaves it to CI (step 4).
8. Offers to **revoke the bootstrap key** as its last call.

### 4. Commit and push

1. Commit `infra/Pulumi.<mode>.yaml` and push.
2. CI needs the GitHub Environment secrets (the local wizard does not). If `gh` was authenticated, bootstrap already set them on the stack's Environment. Otherwise add them under **Settings → Environments → `<mode>` → Environment secrets** (environment-scoped, not repo-level):

| Secret | Value |
| --- | --- |
| `SCW_ACCESS_KEY` | CI deploy key access key |
| `SCW_SECRET_KEY` | CI deploy key secret key |
| `PULUMI_CONFIG_PASSPHRASE` | Pulumi passphrase (generated at bootstrap) |
| `SCW_PROJECT_ID` | Scaleway project ID |
| `SCW_ORGANIZATION_ID` | Scaleway organization ID |

### 5. Revoke the bootstrap key

Do this immediately after bootstrap. The wizard's final step covers it. If you declined or it failed:

1. Delete the key at [IAM → API Keys](https://console.scaleway.com/iam/api-keys).
2. Optionally delete the temporary bootstrap application.

### 6. Sign in as the first admin

The one-shot `backend-release` companion (the migrate step on every new generation) seeds a single admin when the users table is empty ([backend/src/main.migrate.ts](../backend/src/main.migrate.ts), idempotent), from the **required** `admin-email` runtime secret (`ADMIN_EMAIL`) the wizard prompts for. The deploy preflight refuses to roll while it is missing.

1. Open the app and request a magic link for the admin email.
2. Sign in. If magic links do not arrive, seed the Brevo API key (or your email provider's) via **Manage runtime secrets**.

## Architecture reference

Resource modules, layer order, and the infra file layout: [infra/README.md](../infra/README.md).

## Advanced operations

### Seed the admin by hand

When the magic link for the first admin never arrives and the runtime secrets are right, seed directly.

**Fallback: seed by hand** via the serial console (backend instance in the [Scaleway console](https://console.scaleway.com/instance/servers) → **Console**, root password on the instance page), using the bundled seed runner ([backend/scripts/seeds-bundle.ts](../backend/scripts/seeds-bundle.ts)) with the `backend-release` image and its `.env`/`.env.runtime` (`DATABASE_ADMIN_URL`):

```bash
cd /opt/app
docker compose --profile backend run --rm -e ADMIN_EMAIL=you@example.com backend-release node dist/seeds-bundle.js init
```

**Alternative: break-glass from your laptop.** Briefly exposes the DB (ACL-locked to your IP), so prefer the serial console. Both flows serve any operator task against the live database. For staging, **Seed database** exposes, seeds, and closes in one go (refuses production).

1. Expose the DB (needs a bootstrap key). The ACL defaults to `<your.ip>/32` (open ranges refused) and the admin connection string is printed:

   ```bash
   pnpm infra   # → "Open temporary public DB access"
   ```

2. Seed locally:

   ```bash
   ADMIN_EMAIL=you@example.com DATABASE_ADMIN_URL='<printed connection string>' pnpm --filter backend seed:production init
   ```

3. **Close the endpoint again**, then revoke the bootstrap key:

   ```bash
   pnpm infra   # → "Public DB access: OPEN, close it"
   ```

### Reset the database

Rebuilds the app's logical database from migrations plus the admin seed. **Pre-production only, or with services deliberately quiesced: a hard outage.** `pnpm infra` → **Reset database** takes a backup (aborting unless it reports ready), deletes and recreates the logical database over the Scaleway API with a bootstrap key, and re-grants both roles. It never exposes the database and never runs `pulumi up`. Then, on the serial console, re-run the migrate companion, which also seeds the admin from the `ADMIN_EMAIL` runtime secret while the users table is empty ([main.migrate.ts](../backend/src/main.migrate.ts)):

```bash
cd /opt/app
docker compose --profile backend run --rm backend-release
```

Verify: `curl https://<your-app>/api/health?depth=full` reports every component `healthy`.

- **Nothing but you stops this.** Scaleway's API deletes a live database with connected clients and an active replication slot. The typed `<database>@<instance>` confirmation is the only guard.
- **Re-granting is mandatory, and the task owns it.** Deleting a database drops its Scaleway privileges. Neither a recreate nor a backup restore brings them back (`pg_dump` carries table ACLs, not database-level ones), so without it `CONNECT` is absent and the app reports `database_unreachable`.
- If the task fails after the delete, it prints the exact `scw rdb backup restore` command plus the two `privilege set` calls a restore does not perform.

### Key rotation

1. Generate a temporary bootstrap key (Personal API Key is fastest).
2. `pnpm infra` → **Rotate keys**: mints a fresh `<slug>-<mode>-ci-deploy` key and, if `gh` is authenticated, pushes it to the stack's GitHub Environment as `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`. The key is never written to stack config.
3. The next CI deploy uses the new key. No commit is needed. VM-side keys need no rotation: every deploy mints fresh ones.
4. **Revoke the bootstrap key** in the Scaleway console.

### Passphrase rotation

`pnpm infra` → **Rotate passphrase**:

1. Verifies the current passphrase and generates a new one, shown once. Store it first.
2. Re-encrypts the stack (`pulumi stack change-secrets-provider passphrase` rewrites the state object and `Pulumi.<stack>.yaml` with a fresh `encryptionsalt`) under the stack lock, and verifies the rewritten file decrypts with the new passphrase.
3. Syncs the new `PULUMI_CONFIG_PASSPHRASE` to the GitHub Environment (when `gh` is authenticated).
4. Reminds you to commit `infra/Pulumi.<stack>.yaml`.

> Losing the current passphrase means existing secret outputs cannot be decrypted. There is no recovery. Actions secrets are write-only, so the GitHub copy keeps CI working but can never be viewed. Keep your password-manager copy current.

### Teardown

`pnpm infra` → **Teardown** deletes every resource to stop billing without holding owner-tier credentials ([Credentials](#credentials)): it prompts for a transient bootstrap-grade key (`SCW_TEARDOWN_*` env for unattended runs), requires typing `<slug>-<mode>`, runs `pulumi destroy --refresh` under the stack lock, then optionally deletes the stack's IAM principals. Production resources marked `protect: true` (frontend/private buckets, database) are refused unless protection is lifted in code first. Left in place on purpose: the versioned state bucket, operator secret values, and GitHub Environment secrets.

> **Clean slate** below is not a teardown: it resets stack tracking to re-bootstrap a still-running stack. Live resources stay.

<a id="clean-slate"></a>

### Clean slate (start over from scratch)

1. `rm infra/Pulumi.<stack>.yaml`
2. (optional) Scaleway console → Object Storage → delete bucket `<slug>-pulumi-state` (names stay reserved for several hours).
3. (optional) Revoke the bootstrap API key in the Scaleway console.
4. (optional) Delete IAM application `<slug>-<mode>-ci-deploy` and its policy.
5. (optional) Remove `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` from the stack's GitHub Environment.
6. Re-run: `pnpm infra`
