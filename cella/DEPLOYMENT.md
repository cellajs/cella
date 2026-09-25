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
 │           │   (Caddy)   │  │             │ │  oauth (run on backend   │ │
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

- **Load balancer:** the only public entrypoint. Backend, yjs, mcp and oauth share the app origin via registry-declared `pathPrefix` values (`/api`, `/yjs`, `/mcp`, `/oauth`). The LB never rewrites paths. `cdc` never takes an LB route. The backend's internal listener (`internalPort`: the CDC socket and the Yjs relay's materialize route) is reached only through a private, ACL-guarded LB frontend that admits the private network; no public pool forwards to it.
- **VMs:** public IP for egress only (image pulls). All inbound is dropped, including SSH. Every service gets its own VM unless `singleVM` co-hosts the workers and the frontend Caddy container on the backend VM.
- **Frontend VM:** Caddy adds security headers/CSP and the SPA deep-link fallback.
- **Database:** private-network only. A break-glass toggle can expose it temporarily ([Changing infrastructure](#changing-infrastructure)).
- **Buckets:** outside the VPC. Browsers read the public upload bucket directly and use presigned URLs for the private one.

## Deploy flow

```
Release published, push to main (staging), or manual dispatch
        ↓
CI builds images in parallel, and the frontend
in a job that holds no secret
        ↓
`infra deploy --dist` (one command): preflights + stack lock;
the frontend asset upload runs inside it, concurrent
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

<a id="credentials"></a>

## API keys

Scaleway API keys descend in privilege, each in a different store, each minting the next. Every key is named after its bearer, the way the Scaleway console shows it.

| Key | Permissions | Lifetime | Where stored |
| --- | --- | --- | --- |
| **Owner API key** (your own key as organization Owner, **or** an application holding ProjectManager + IAMManager) | Everything: required for any `pulumi up` that touches privileged resources (DB, VPC, private network, IAM policies), and for setup, teardown and runtime secrets. The CLI checks the bearer before using one: an application the engine created is refused by name. | Your durable key stays in the OS keychain or password manager; a privileged run never drives Pulumi with it but mints a 30-minute key from it and revokes that at the end. A short-lived key you paste is used as it is, and you revoke it afterwards. | `SCW_OWNER_ACCESS_KEY` / `SCW_OWNER_SECRET_KEY` in `infra/.env.<mode>` as a `keychain:` or `op:` reference; without it the CLI prompts. |
| **CI deploy application key** (`<slug>-<mode>-ci-deploy`) | Write on compute / LB / private networks / edge / secrets / object storage / registry / DNS. **Read-only** on VPC and RDB (privileged resources). Project-scoped. | Long-lived. Rotate via the CLI **Rotate keys** action ([Key rotation](#key-rotation)) | The stack's GitHub Environment (`staging` or `production`) secrets `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`, the names the Scaleway provider reads. |
| **Admin application key** (`<slug>-<mode>-admin`) | Read-only on every project resource, object storage full access, IAM read; admitted to the state bucket. The day-2 key for status, Preview, and the state side of Apply infra change. | Long-lived. Created by the CLI **Rotate keys** action; custody copy at `/<slug>-<mode>/engine/admin-key`. | `infra/.env.<mode>` as `SCW_ADMIN_ACCESS_KEY` / `SCW_ADMIN_SECRET_KEY` (0600, never committed): setup writes it on the machine that ran it; anywhere else, **Manage keys & secrets → Fetch admin application key** reads it from Secret Manager with your Owner API key. |
| **Boot + service application keys** (`<slug>-<mode>-boot`, `<slug>-<mode>-vm-<service>`) | Boot key: registry pull + boot-diag write + handoff-only secret read. Service key: path-conditioned secret read (its own + shared folders). The backend additionally gets granular S3 object sets. | Minted per deploy by the CI key. Superseded keys are pruned on the next mint | Boot key baked into VM cloud-init. Each service key is delivered via a single-access handoff bundle in Secret Manager. Not in stack config. |

The **Pulumi passphrase** sits outside the chain: it encrypts the stack's secret outputs in the state bucket ([Passphrase rotation](#passphrase-rotation)). **Store passphrase in keychain** moves this machine's copy into the OS keychain and leaves `keychain:<slug>-<mode>/PULUMI_CONFIG_PASSPHRASE` in the env file; the password-manager copy stays the durable one.

On an operator machine `infra/.env.<mode>` therefore holds the admin application key, the passphrase and, optionally, the Owner API key, as values or as `keychain:` / `op:` references the CLI resolves on load ([env-files.ts](../infra/lib/utils/env-files.ts)). The provider's own `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` names are never read from the file: until 0.12 they meant the admin application key there, and the CLI still reads them as `SCW_ADMIN_*` with a rename warning, while in the process environment they keep meaning the key the process was started with (a CI runner). `SCW_STATE_*` and `SCW_BOOTSTRAP_*` are read the same way for one release. On start the CLI prints which principal the admin application key belongs to, whether the stack is locked, and what is live, so a CI key in the admin slot is visible before any action.

## CI deploys

[.github/workflows/deploy.yml](../.github/workflows/deploy.yml) is a thin trigger (push to main, release published, manual dispatch) for the reusable [.github/workflows/deploy-pipeline.yml](../.github/workflows/deploy-pipeline.yml): `setup` derives names and matrices from config, a build matrix pushes images, and one `deploy` job runs a single command:

```
pnpm --filter infra run deploy --mode <staging|production> --sha <sha> --git-ref <ref>
```

- Pushes to main auto-deploy **staging**. Create a `staging` [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) holding the `SCW_*` secrets before merging to main. Until `Pulumi.staging.yaml` carries the `infra:bootstrapComplete` marker, the deploy job is skipped. The newest push cancels a superseded in-flight staging run (`cancel-in-progress`). Production rollouts never cancel. Manual: Actions → Deploy → Run workflow → `staging`.
- **Production** deploys only on a published release or a manual dispatch. For a manual promote, give the `production` GitHub Environment required reviewers. The run then pauses for approval.

### Bring your own CI

1. **Env**: export `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_DEFAULT_PROJECT_ID`, `SCW_DEFAULT_ORGANIZATION_ID`, `PULUMI_CONFIG_PASSPHRASE` (the workflow maps its `SCW_PROJECT_ID` / `SCW_ORGANIZATION_ID` secrets onto the `SCW_DEFAULT_*` names the Scaleway provider reads). Install node, pnpm, docker (buildx), and the pulumi CLI.
2. **Deploy**: `pnpm --filter infra run deploy --mode <mode> --sha <sha> --build`. `--build` bakes and pushes every image (app services + boot runner) via `docker buildx bake` with the registry `:buildcache` shared with CI. Safe to re-run. The stack lock serializes concurrent attempts.

GitHub Actions builds images as a parallel matrix and omits `--build`. `--dist <dir>` supplies a prebuilt frontend: GitHub Actions builds it in a job with no secrets, because the Vite build and its dependencies' install scripts run third-party code. Without `--dist` the command builds the frontend itself in a child process stripped of the deploy's keys, which keeps them out of its environment but not out of reach of code running as the same user on that machine. `--git-ref`, when provided, gates production deploys to main/release refs.

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
| [config/general.config.ts](../infra/config/general.config.ts) | DB node type & volume, asset retention | DB fields via CLI **Apply infra change** (RDB is a privileged resource). The rest via routine CI deploy |
| [config/runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts) | Which services receive each runtime secret | routine CI deploy |

## Changing infrastructure

Most config changes ship through a normal CI deploy, including toggling `appConfig.services.<slug>.enabled`. **Privileged** resources (database, VPC, the VM IAM principals and policies) can only be mutated with your Owner API key: `pnpm infra` → **Apply infra change**, which:

1. Reads the Pulumi passphrase and the Owner API key: `SCW_OWNER_ACCESS_KEY` / `SCW_OWNER_SECRET_KEY` when set ([API keys](#credentials)), else a prompt ([Your Owner API key](#2-your-owner-api-key)). The bearer is checked first: an organization Owner, or a principal holding IAMManager; a CI, admin, boot or VM key is refused by name. A durable key mints a 30-minute key for the run. The state side (login, lock, `up`) uses your admin application key from `infra/.env.<mode>`.
2. Passes the run's key to the Scaleway provider via `SCW_*` env. It is never written to stack config.
3. Takes the stack lease (renewed while the run lasts, released on Ctrl-C; a lock left by a dead run lapses within minutes and the CLI waits for that) and creates any missing VM IAM application (`<slug>-<mode>-vm-<service>`, `<slug>-<mode>-boot`) for the service registry.
4. Shows the plan (`pulumi preview --diff`) and asks once whether to apply it, then runs `pulumi up` without setting `bootstrap:computeDeferred`, so the running VMs and LB stay in place. This run also reconciles the VM policy rules, which a CI deploy leaves untouched.
5. Verifies the result live: every VM, boot and CI principal holds exactly the declared grant, with the exact secret condition and project scope, and the declared database privileges exist. Pulumi reporting an update is not proof (one update was recorded in state while Scaleway kept the old rule), so a mismatch fails the run. `pnpm infra --debug-provider` keeps the engine and provider log of the `up` under `infra/.debug/` for such a case.
6. Revokes the minted key, or reminds you to revoke a pasted one.

**Preview** in the same menu is the read-only dry run of an Apply infra change, refreshed against live state first so drift made outside Pulumi shows up; a CI deploy applies the same diff except the VM policy rules. Your admin application key is enough for it, and the organization id comes from `SCW_ORGANIZATION_ID` in `backend/.env`.

The same preview runs as a **preflight**: first thing in every deploy, and as the `infra-preflight` job on the release PR against the production Environment. It names any pending privileged change (a database privilege, a VM policy rule, the VPC) with the Apply command above and, for an IAM policy, the old and new value of each changed rule path, so an owed Apply blocks the release PR instead of failing the production deploy after the images have built.

VM IAM principals and policies follow the **service registry** ([config/services.config.ts](../infra/config/services.config.ts)), not the enabled set: every registry service that owns VMs has an application and a path-conditioned policy, and under `singleVM` the host condition covers every registry worker. Toggling `enabled` in either mode therefore needs no Apply. Adding or removing a registry service (the `oauth` worker added in #1179 is such an addition), or flipping `singleVM`, does: until you run **Apply infra change**, the next deploy fails at `requirePrincipalId` (split-VM) or at "Verify VM IAM grants" (`singleVM`). A registry service that is not deployed keeps its principal with zero API keys; the deploy's "Verify VM IAM grants" step asserts that and the key mint purges any it finds.

## Fresh installation

`pnpm infra` launches the CLI ([cli/infra-cli.ts](../infra/cli/infra-cli.ts)). Without a local `Pulumi.<stack>.yaml` it runs the install wizard. A fresh install defaults to **staging**. Production is the same wizard via `pnpm infra --mode production`. `--defaults` takes every optional default and prompts only for required inputs (Owner API key, admin email). `INFRA_NON_INTERACTIVE=1` also takes the defaults but fails on a required input with no environment value. `pnpm --filter infra status` shows the current state and next action.

### 1. Prerequisites

1. A domain, set as `appConfig.domain`, registered as external at https://console.scaleway.com/domains/external.
2. The Pulumi CLI, at least at the version of the `@pulumi/pulumi` package in `infra/package.json` (CI installs exactly that version, and `pnpm infra` warns when yours is older):

   ```bash
   brew install pulumi/tap/pulumi
   ```

3. GitHub CLI (recommended), authenticated with `gh auth login`, so the wizard can set the GitHub Environment secrets.
4. Docker with buildx (recommended), so the wizard can run the first deploy locally.
5. A Scaleway project (optional): without `SCW_PROJECT_ID` in `backend/.env`, the wizard picks or creates one (named after the app slug) and writes the id back.

<a id="2-generate-a-bootstrap-api-key"></a>

### 2. Your Owner API key

1. Easiest: as an organization Owner, generate an [API key for your user](https://console.scaleway.com/iam/users) (User menu → API keys → Generate). Give it an expiry when it is only for this setup.
2. Stricter: create an Application in [IAM → Applications](https://console.scaleway.com/iam/applications) with **ProjectManager + IAMManager** on the organization, and generate an API key for it.
3. Keep access key, secret key, project ID, and organization ID in your password manager. For day-2 runs, put the pair in `infra/.env.<mode>` as `SCW_OWNER_ACCESS_KEY` / `SCW_OWNER_SECRET_KEY` (a `keychain:` or `op:` reference): every privileged run then mints its own 30-minute key from it.

### 3. Run the infra CLI

```bash
pnpm infra
```

1. Picks or creates the Scaleway project (prerequisite 5).
2. Generates the Pulumi passphrase. **Store it when shown**: it is shown once and unrecoverable (set `PULUMI_CONFIG_PASSPHRASE` beforehand to supply your own).
3. Creates state storage and initializes Pulumi.
4. Creates the CI deploy and admin applications with their keys and writes the admin application key to `infra/.env.<mode>` (`SCW_ADMIN_*`) on this machine.
5. Configures GitHub (if `gh` is authenticated).
6. Optionally runs the first `pulumi up` (registry, DB, and network, but no compute yet).
7. Offers the **first deploy** (the CI command with `--build`, using the new CI deploy key). Accepting ends with a live app. Declining leaves it to CI (step 4).
8. Offers to **revoke the key you pasted** as its last call (a key from `SCW_OWNER_*` is yours to keep).

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

If you pasted a key created for this setup, revoke it now. The wizard's final step covers it. If you declined or it failed:

1. Delete the key at [IAM → API Keys](https://console.scaleway.com/iam/api-keys).
2. Optionally delete the temporary application.

A key you keep in `SCW_OWNER_*` stays: privileged runs mint short-lived keys from it.

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
pnpm infra   # → Stack setup → "Refresh GeoIP data"
```

The task downloads from DB-IP (falling back to the previous month when the new one is not published yet), verifies every archive is a real MMDB and uploads the databases before a `manifest.json` that records the month. A failed download or a bucket problem costs only the country line; sign-ins never depend on it. `GEOIP_SOURCE_URL=off` disables the refresh, another prefix or bucket overrides the source.

### Seed the admin by hand

When the magic link for the first admin never arrives and the runtime secrets are right, seed directly.

**Fallback: seed by hand** via the serial console (backend instance in the [Scaleway console](https://console.scaleway.com/instance/servers) → **Console**, root password on the instance page), using the bundled seed runner ([backend/scripts/seeds-bundle.ts](../backend/scripts/seeds-bundle.ts)) with the `backend-release` image and its `.env`/`.env.runtime` (`DATABASE_ADMIN_URL`):

```bash
cd /opt/app
docker compose --profile backend run --rm -e ADMIN_EMAIL=you@example.com backend-release node dist/seeds-bundle.js init
```

**Alternative: break-glass from your laptop.** Briefly exposes the DB (ACL-locked to your IP), so prefer the serial console. Both flows serve any operator task against the live database. For staging, **Seed database** exposes, seeds, and closes in one go (refuses production).

1. Expose the DB (needs your Owner API key). The ACL defaults to `<your.ip>/32` (open ranges refused) and the admin connection string is printed:

   ```bash
   pnpm infra   # → "Open temporary public DB access"
   ```

2. Seed locally:

   ```bash
   ADMIN_EMAIL=you@example.com DATABASE_ADMIN_URL='<printed connection string>' pnpm --filter backend seed:production init
   ```

3. **Close the endpoint again** (and revoke a pasted key):

   ```bash
   pnpm infra   # → "Public DB access: OPEN, close it"
   ```

### Reset the database

Rebuilds the app's logical database from migrations plus the admin seed. **Pre-production only, or with services deliberately quiesced: a hard outage.** `pnpm infra` → **Reset database** takes a backup (aborting unless it reports ready), deletes and recreates the logical database over the Scaleway API with your Owner API key, and re-grants both roles. It never exposes the database and never runs `pulumi up`. Then, on the serial console, re-run the migrate companion, which also seeds the admin from the `ADMIN_EMAIL` runtime secret while the users table is empty ([main.migrate.ts](../backend/src/main.migrate.ts)):

```bash
cd /opt/app
docker compose --profile backend run --rm backend-release
```

Verify: `curl https://<your-app>/api/health?depth=full` reports every component `healthy`.

- **Nothing but you stops this.** Scaleway's API deletes a live database with connected clients and an active replication slot. The typed `<database>@<instance>` confirmation is the only guard.
- **Re-granting is mandatory, and the task owns it.** Deleting a database drops its Scaleway privileges. Neither a recreate nor a backup restore brings them back (`pg_dump` carries table ACLs, not database-level ones), so without it `CONNECT` is absent and the app reports `database_unreachable`.
- If the task fails after the delete, it prints the exact `scw rdb backup restore` command plus the two `privilege set` calls a restore does not perform.

### Key rotation

1. Have your Owner API key at hand (`SCW_OWNER_*`, or a key to paste).
2. `pnpm infra` → **Rotate keys**: mints a fresh `<slug>-<mode>-ci-deploy` key and, if `gh` is authenticated, pushes it to the stack's GitHub Environment as `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`. It also recreates the admin application key and rewrites `infra/.env.<mode>`. Neither key is written to stack config.
3. The next CI deploy uses the new key. No commit is needed. VM-side keys need no rotation: every deploy mints fresh ones.
4. Revoke a pasted key in the Scaleway console.

To put the admin application key on another operator machine, run **Manage keys & secrets → Fetch admin application key** there with your Owner API key: it reads the custodied pair, confirms it belongs to the admin application, and writes `infra/.env.<mode>` (`SCW_ADMIN_*`).

### Passphrase rotation

`pnpm infra` → **Rotate passphrase**:

1. Verifies the current passphrase and generates a new one, shown once. Store it first.
2. Re-encrypts the stack (`pulumi stack change-secrets-provider passphrase` rewrites the state object and `Pulumi.<stack>.yaml` with a fresh `encryptionsalt`) under the stack lock, and verifies the rewritten file decrypts with the new passphrase.
3. Syncs the new `PULUMI_CONFIG_PASSPHRASE` to the GitHub Environment (when `gh` is authenticated).
4. Reminds you to commit `infra/Pulumi.<stack>.yaml`.

> Losing the current passphrase means existing secret outputs cannot be decrypted. There is no recovery. Actions secrets are write-only, so the GitHub copy keeps CI working but can never be viewed. Keep your password-manager copy current.

### Teardown

`pnpm infra` → **Teardown** deletes every resource to stop billing: it takes your Owner API key the way Apply infra change does ([API keys](#credentials)), requires typing `<slug>-<mode>`, runs `pulumi destroy --refresh` under the stack lock, then optionally deletes the stack's IAM principals. Production resources marked `protect: true` (frontend/private buckets, database) are refused unless protection is lifted in code first. Left in place on purpose: the versioned state bucket, operator secret values, and GitHub Environment secrets.

> **Clean slate** below is not a teardown: it resets stack tracking to set up a still-running stack again. Live resources stay.

<a id="clean-slate"></a>

### Clean slate (start over from scratch)

1. `rm infra/Pulumi.<stack>.yaml`
2. (optional) Scaleway console → Object Storage → delete bucket `<slug>-pulumi-state` (names stay reserved for several hours).
3. (optional) Revoke a pasted setup key in the Scaleway console.
4. (optional) Delete IAM application `<slug>-<mode>-ci-deploy` and its policy.
5. (optional) Remove `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` from the stack's GitHub Environment.
6. Re-run: `pnpm infra`
