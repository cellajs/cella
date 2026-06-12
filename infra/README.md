# Infrastructure

Deploy your web app to [Scaleway](https://www.scaleway.com/) using Pulumi + GitHub Actions.

## Overview

This infrastructure is built around three principles:

1. **Pulumi provisions with most values from config files.** Pulumi modules create resources, but resource names, domains and sizing are derived from [config files](#configuration).
2. **CI performs all routine deploys.** Pushing to `main` builds images and rolls the running services with zero downtime.
3. **Local `pulumi up` is only for bootstrap or elevated changes.** The day-to-day path never needs a privileged key on your laptop. A human with a temporary bootstrap key is required only for the initial install and for changes to data-bearing resources (database, VPC, private network).


## How a deploy works

The deployment lifecycle — what happens when you push to `main`:

```
Developer pushes to main
        ↓
GitHub Actions builds images
        ↓
Runs pulumi up
        ↓
Uploads image tag to the deploy-tags bucket
        ↓
On-VM reconciler detects the new tag
        ↓
Performs in-place or blue-green rollout
        ↓
Load balancer keeps serving traffic
```

At runtime, the load balancer never talks to the app container directly. Each VM runs a tiny **ingress** Caddy container that owns the LB-facing host port and forwards to the app container by its compose-network name (the app publishes no host port):

```
Scaleway LB ──▶ ingress (Caddy, owns host port) ──▶ app container (no host port)
```

## The three credentials

The security model is defined by exactly three Scaleway API keys, in strictly descending privilege, each in a different store. Each key creates or provisions the next:

```
Bootstrap key      (broad, short-lived; in your password manager only)
    │ creates
    ▼
CI deploy key      (project-scoped write; in the GitHub Environment)
    │ provisions
    ▼
VM reader key      (read-only; baked into each VM)
    │ reads
    ▼
runtime secrets + images on the VM
```

| Key | Permissions | Lifetime | Where stored |
|-----|-------------|----------|-------------|
| **Bootstrap key** | Owner (via Personal API Key) **or** ProjectManager + IAMManager on a dedicated IAM application | Minutes — revoked immediately after each use (initial bootstrap or manual rotation). Also required for any `pulumi up` that touches bootstrap-owned modules (DB, VPC, private network). | Password manager only, never on disk |
| **CI deploy key** (`<slug>-ci-deploy`) | Write on compute / LB / edge / secrets / object storage / registry; **read-only** on VPC / private network / RDB (those are bootstrap-owned). Project-scoped, plus DNS at org scope. | Long-lived; rotate manually by re-running the CLI's **Rotate keys** action (see [Key rotation](#key-rotation)) | The `production` GitHub Environment secrets `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` (environment-scoped, not repo-scoped). The Scaleway provider authenticates from those env vars, not from stack config. |
| **VM reader key** (`<slug>-vm-reader`) | Read-only registry / object storage / Secret Manager (incl. `SecretManagerSecretAccess` for decrypt-read). Just enough for a VM to pull images and hydrate `/opt/app/.env.runtime`. | Long-lived; rotates with the CI key | Seeded into Scaleway Secret Manager at bootstrap (the `vm-reader-key` secret), read back at `pulumi up`, and baked into VM cloud-init. Not in stack config. |

Exact IAM permission sets and the bootstrap-owned boundary are documented in [Security & IAM reference](#security--iam-reference).

## Routine deploys (CI)

The workflow at [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) runs:

- **On push to `main`** — builds images, uploads the frontend, runs `pulumi up`, verifies the deployment.
- **On manual dispatch** — same, against the chosen environment (`staging` or `production`).


Routine deploys don't replace VMs. CI writes the new image SHA to the deploy-tags bucket; the on-VM reconciler pulls it and rolls the app behind a per-VM ingress proxy — in-place for cdc/yjs/ai/frontend, blue-green (two slots) for the backend — so the load balancer backend never drains. See [rollout strategies](#rollout-strategies) for the rollover model.

To trigger a staging deploy: GitHub → Actions → Deploy → Run workflow → select `staging`.

To gate production behind manual approval, configure a [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) named `production` with required reviewers — the workflow already targets it.


## Rollout strategies

Each service declares its roll strategy in the fork-owned service registry ([config/services.config.ts](config/services.config.ts)). The split is simple: **backend → blue-green, everything else → in-place.**

| Strategy | Services | How |
|----------|----------|-----|
| **blue-green** | backend | Run two named slots (`backend-blue` / `backend-green`). Bring the idle slot up on the new tag, identity-gate it, then flip the ingress upstream to it and retire the old slot. |
| **in-place** | frontend, ai, cdc, yjs | Recreate the single app container (`up -d --no-deps <svc>`). The ingress holds the listener open and retries the upstream across the ~seconds the container is restarting. |

**Why backend is blue-green and the rest are in-place.** The backend is the critical path, so blue-green guards against a bad release (at ~2× RAM during cutover). The others can't or needn't pay for it: **cdc** owns a single Postgres replication slot (two instances impossible), **yjs** holds in-memory CRDT/WS state (two would split-brain), and **ai** / **frontend** are stateless and low-stakes where in-place is already near-zero-downtime.

Only cloud-init changes (reconciler/package updates, an instance-type resize) replace the VM; the LB health checks handle that. Routine runtime secret changes don't — the reconciler refreshes `/opt/app/.env.runtime` each tick and rolls the service when that file changes, even if the image tag didn't.

## Configuration

All tunable infra config lives in committed, type-checked files under [config/](config) — edit a value there and deploy, no `pulumi config set`. Each field is either a single value or a per-mode map (`{ production: …, staging: … }`).

**Common questions:**
- *Where do I change a VM size?* → `instanceType` in [config/services.config.ts](config/services.config.ts) (applied by the next CI deploy).
- *Where do I change the database size?* → DB node type & volume in [config/general.config.ts](config/general.config.ts) (bootstrap-owned RDB — apply via [Changing infrastructure](#changing-infrastructure)).

| File | Owns | Applied by |
|------|------|------------|
| [config/services.config.ts](config/services.config.ts) | Per-service VM size (`instanceType`, required), rollover, LB routing, env, feature flags | routine CI deploy |
| [config/general.config.ts](config/general.config.ts) | DB node type & volume, WAF, Edge Services, asset retention | DB fields via CLI **Apply infra change** (bootstrap-owned RDB); the rest via routine CI deploy |
| [config/runtime-secrets.config.ts](config/runtime-secrets.config.ts) | Which services receive each runtime secret | routine CI deploy |

What stays in Pulumi config (not committed fork data): secrets, the transient DB public-endpoint break-glass toggle (`infra:dbPublicEndpoint` / `infra:dbPublicAcl`), and the bootstrap `computeDeferred` lifecycle marker.

## Changing infrastructure

Most config changes ship through a normal CI deploy. But **bootstrap-owned** resources — the database, VPC, and private network — can only be mutated with a temporary bootstrap key. 

To apply a bootstrap-owned change (e.g. resize the database), re-run the CLI (`pnpm infra`) and choose **Apply infra change**. The action:

1. Prompts for the Pulumi passphrase and a fresh bootstrap key (broad permissions, see [Generate a bootstrap API key](#2-generate-a-bootstrap-api-key)).
2. Supplies that key to the Scaleway provider via `SCW_*` env (it is never written to stack config).
3. Runs `pulumi up` against the already-bootstrapped stack. Compute stays up — unlike the fresh-provision flow, Apply infra change does **not** set the `bootstrap:computeDeferred` marker, so the running VMs/LB are left in place.
4. Reminds you to revoke the bootstrap key.

No stack file is mutated and no credential is written to disk, so an interrupted run needs no cleanup — `pulumi up` is idempotent, so just re-run Apply infra change to converge.


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


### 5. Commit and push

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

### 6. Revoke the bootstrap key

> **Do this immediately after bootstrap completes.**

1. Go to [IAM → API Keys](https://console.scaleway.com/iam/api-keys) and delete the bootstrap key.
2. Optionally delete the temporary bootstrap application too.

After bootstrap, only the long-lived deploy and VM keys should remain. From here on, **all routine deploys happen in CI**.

## Architecture reference

### Layers

The infrastructure is organised in 6 phases, deployed in dependency order ([index.ts](index.ts) composes the modules):

| Layer | Module | Resources |
|-------|--------|-----------|
| 1 | `storage` | Frontend bucket (SPA hosting), public & private upload buckets |
| 2 | `edge`, `dns` | Edge Services CDN pipeline, WAF, TLS certs, DNS records |
| 3 | `network`, `registry` | VPC, private networks, container registry |
| 4 | `database` | Managed PostgreSQL 17 |
| 5 | `secrets`, `compute` | Secret Manager, Docker Compose VMs |
| 6 | `loadbalancer` | Scaleway LB with TLS termination, host-header routing, DNS |

Application telemetry is exported to Maple.dev from the runtime services; no observability resources are provisioned in Pulumi.

### How config flows

```
shared/config/config.default.ts   → appConfig (slug, domain, URLs, S3 settings)
shared/config/config.production.ts → overrides for production mode
        ↓
infra/config/*.config.ts          → fork-owned sizing/feature knobs (VMs, DB, WAF, secrets map)
        ↓
infra/pulumi-context.ts           → derives all naming, domains, regions; binds config + appConfig
        ↓
infra/resources/*.ts              → uses naming + `infra` (resolved config) + infraConfig (secrets/break-glass)
        ↓
Pulumi.<stack>.yaml               → encrypted secrets + transient operator toggles only
```

No resource names, domains, bucket names, or sizing are hardcoded in the Pulumi modules — everything flows from `appConfig` and the `config/` files.

### Stacks

Only `production` is supported out of the box, but additional stacks (e.g. `staging`) can be added. This will be documented later. 

### File structure

```text
infra/
├── caddy/                  Caddy templates
├── cli/                    Infra CLI
├── compose/                Build and generate compose.gen.yml
├── config/                 Where customisable config lives
├── lib/                    Shared infra utilities used across Pulumi resources and tasks
├── reconciler/             On-VM deploy reconciler that applies image/tag updates in place
├── resources/              Pulumi resources: network, db, compute, LB ...
├── tasks/                  Non-interactive operator/CI tasks (key setup, verification, waits)
├── tests/                  Higher-level infra test coverage

.github/workflows/          CI half of the deploy control plane
├── deploy.yml              Build + push images, upload frontend, run `pulumi up`, roll services
└── infra-preview.yml       `pulumi preview` on PRs touching infra/ or shared/
```

The `.github/workflows/` files are tightly coupled to this package: `deploy.yml` runs the same `pulumi up` the CLI does (authenticating with the CI deploy key) and then drives the on-VM reconciler via the deploy-tags bucket, while `infra-preview.yml` mirrors the **Preview** CLI action on PRs.

## Security & IAM reference

All IAM permission sets for the three credentials live in one annotated manifest:
[`lib/permissions.ts`](lib/permissions.ts). It is the single source of truth — the
provisioning tasks, the Pulumi VM-reader policy, and the `pulumi up` permission-error
classifier all import from it, and [`tasks/permission-sets.test.ts`](tasks/permission-sets.test.ts)
locks the exact membership so any change is visible in review. Read that file for the
current grants and the per-set rationale (kept there rather than duplicated here, since
the sets still change as the infra evolves).

The key split is **write at steady state vs read-only**: the CI deploy key has
`…FullAccess` on resources it mutates every deploy (registry, instances, LB, edge,
object storage, secrets) but only `…ReadOnly` on the **bootstrap-owned**
families (VPC, private network, RDB). So **any change to
[`resources/database.ts`](resources/database.ts), [`resources/network.ts`](resources/network.ts),
or anything else under VPC / PN / RDB will fail in CI** with `insufficient permissions: write …`.
That's intentional — destructive operations on data-bearing resources go through a human
running `pulumi up` locally with the bootstrap key (see [Changing infrastructure](#changing-infrastructure)).
The same bootstrap-owned boundary is encoded once as `BOOTSTRAP_OWNED_FRAGMENTS` in the manifest.


## Advanced operations

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

## Emergency procedures

### Emergency access to a VM

There is **no inbound SSH** on the compute security group (closed by default). For break-glass:

1. In the [Scaleway console](https://console.scaleway.com/instance/servers), open the misbehaving instance and click **Console** to attach the serial console.
2. Authenticate with the root password set by Scaleway (visible on the instance page).
3. Investigate; capture what you need.
4. Detach and document what was done.

For routine debugging, ship logs / metrics out of the VM (via Cockpit) rather than opening shells.
