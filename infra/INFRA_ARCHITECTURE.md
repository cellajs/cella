# Infrastructure architecture

> For deployment instructions see [README.md](./README.md).

## Layers

The infrastructure is organised in 6 phases, deployed in dependency order:

| Layer | Module | Resources |
|-------|--------|-----------|
| 1 | `storage` | Frontend bucket (SPA hosting), public & private upload buckets |
| 2 | `edge`, `dns` | Edge Services CDN pipeline, WAF, TLS certs, DNS records |
| 3 | `network`, `registry` | VPC, private networks, container registry |
| 4 | `database` | Managed PostgreSQL 17 (automated backups in production) |
| 5 | `secrets`, `compute` | Secret Manager, Docker Compose VMs (one per service) |
| 6 | `loadbalancer` | Scaleway LB with TLS termination, host-header routing, DNS |

Application telemetry is exported to Maple.dev from the runtime services; no observability resources are provisioned in Pulumi anymore.

## Compute layer

Backend services run on individual Scaleway VMs (DEV1-S by default, sized per service in the registry — backend is DEV1-M in production; see [Defaults per stack](#defaults-per-stack)), each provisioned with cloud-init that installs Docker, writes the gen. Compose file ([compose.gen.yml](compose.gen.yml)) as `/opt/app/compose.yml`, a static `.env`, a Secret Manager manifest, and then hydrates `/opt/app/.env.runtime` from Scaleway Secret Manager before starting a single service profile. A [Scaleway Load Balancer](https://www.scaleway.com/en/load-balancer/) (LB-S) provides TLS termination via Let's Encrypt, host-header routing, and health checks. All VMs and the LB sit on a private network alongside the managed database.

| Service | VM | Port | Profile | Notes |
|---------|---|------|---------|-------|
| Backend API | `backend` | 4000 | `backend` | Hono API server, SSE streams. **Blue-green** roll (two slots); owns schema migrations. DEV1-M in production. |
| CDC Worker | `cdc` | 4001 | `cdc` | Singleton (`deleteBeforeReplace`) for replication slot. In-place roll. |
| Yjs Relay | `yjs` | 4002 | `yjs` | WebSocket relay, LB timeouts set to 1h. In-place roll. |
| AI Worker | `ai` | 4003 | `ai` | AI inference API (reuses the backend image). In-place roll. |
| Frontend | `frontend` | 80 | `frontend` | Caddy reverse-proxy in front of the S3 SPA bucket. In-place roll. |

### Zero-downtime deploys

Routine deploys no longer replace the VM. Each VM runs a tiny **ingress** Caddy container that owns the LB-facing host port and forwards to the app container by its compose-network name (the app publishes no host port):

```
Scaleway LB ──▶ ingress (Caddy, owns host port) ──▶ app container (no host port)
```

CI writes the new image SHA to the deploy-tags bucket; the on-VM reconciler (systemd timer, every 20s) pulls it and rolls the app behind the ingress. There are **two roll strategies**, declared per service in the fork-owned service registry ([compose/services.config.ts](compose/services.config.ts)):

| Strategy | Services | How |
|----------|----------|-----|
| **in-place** | cdc, yjs, ai, frontend | Recreate the single app container (`up -d --no-deps <svc>`). The ingress holds the listener open and retries the upstream across the ~seconds the container is restarting. |
| **blue-green** | backend | Run two named slots (`backend-blue` / `backend-green`). Bring the idle slot up on the new tag, identity-gate it, then flip the ingress upstream to it and retire the old slot. |

In **both** strategies the LB never drains — it health-checks the ingress's local `/__ingress/health`, which returns `200` while the ingress process is up, so the app's brief unavailability never reaches the LB. The reconciler validates every roll by polling `/health` and asserting `X-App-Version == <desired SHA>` before committing the new tag; a failed roll is rolled back (in-place) or simply never flipped (blue-green).

**Why backend is blue-green and the rest are in-place.** Blue-green requires running OLD + NEW simultaneously and flipping an upstream — a good fit only for a stateless service that is safe to run as two instances and critical enough to justify the cost:

- **backend** is the stateless HTTP API on the critical path, and it owns schema migrations. Blue-green lets a bad release fail its health gate on the idle slot without ever touching the serving slot. The trade-off is RAM: both slots run side-by-side during cutover, so the backend VM is sized **DEV1-M (4 GB)** in production — DEV1-S (2 GB) cannot hold both (see [Defaults per stack](#defaults-per-stack)).
- **cdc** is a **singleton** — it owns a single Postgres logical replication slot and *must not* run two instances at once, so blue-green is structurally impossible. Its in-place roll has a brief gap; CDC resumes from the slot LSN on reconnect.
- **yjs** holds in-memory CRDT/WebSocket state; two instances would risk split-brain. WS clients already reconnect on any roll.
- **ai** / **frontend** are stateless but low-stakes; their in-place roll is already near-zero-downtime (frontend content lives in S3, behind a sub-second Caddy restart), so blue-green would add cost and moving parts for no real benefit.

During an in-place roll the bridge is `lb_try_duration 20s` (Caddy re-resolves the upstream and retries the dial across the restart) plus `stop_grace_period: 30s` (in-flight requests drain after `SIGTERM`). During a blue-green flip the new slot is already healthy before any traffic moves; `caddy reload` swaps the upstream and the old slot drains for `DRAIN_SECONDS` before being stopped.

Only cloud-init changes (reconciler/package updates, or an instance-type resize) trigger a full VM replacement, which the LB health checks handle gracefully. Routine runtime secret changes do not replace the VM: the reconciler refreshes `/opt/app/.env.runtime` on every tick and rolls the service if that hydrated env file changed, even when the image tag stayed the same. Wiring lives in [compose/](compose/) (the typed service registry, synthesized to [compose.gen.yml](compose.gen.yml)), [ingress.Caddyfile](ingress.Caddyfile), [resources/compute.ts](resources/compute.ts), [resources/cloud-init.ts](resources/cloud-init.ts), [resources/loadbalancer.ts](resources/loadbalancer.ts), and [reconciler/reconciler.sh](reconciler/reconciler.sh).

### Operating the reconciler

The reconciler mechanism, exit codes (`0`–`6`), and concurrency model are documented in the header of [reconciler/reconciler.sh](reconciler/reconciler.sh). Per-VM state lives in `/var/lib/reconciler/` (`current.tag`, `previous.tag`, and for blue-green services `active.slot` + `last-failed-roll.log`); logs go to `journalctl -u reconciler.service`. VMs have no SSH listener — use the Scaleway serial console for break-glass access.

Every roll also broadcasts a **status object** to `s3://<deploy-tags-bucket>/status/<service>.json` (phase, result, exit code, and a failure reason even on an unexpected exit) so CI and humans can see WHAT the reconciler is doing and WHY a roll failed without SSH. The CI `wait-for-version` poll reads it to surface the live phase, and to **fast-fail on a terminal rollout failure** (a bad release — compose-up/health/migrate, exit `4`/`5`/`6`) with the reconciler's reason. Infra transients (tag-fetch/pull, exit `2`/`3`) self-heal on the next 20s tick, so the poll keeps waiting through those. On a health failure the failed slot's logs are uploaded to `s3://<state-bucket>/boot-diag/<service>-failed-<ts>.log`, which `fetch-boot-diag` surfaces automatically.


- **Diagnose a stuck deploy** — the CI `roll-backend` / `roll-rest` jobs poll `/health` for `X-App-Version == <SHA>` and upload boot-diag logs on failure. On the VM: `systemctl status reconciler.timer`, `journalctl -u reconciler.service`, `curl -sI 127.0.0.1:<port>/health` (app identity) and `curl -s 127.0.0.1:<port>/__ingress/health` (LB liveness).
- **Force a re-roll / rollback** — rewrite the tag object (`deploy/<svc>.tag` in the deploy-tags bucket): write a sentinel SHA, wait 20s, then write the desired (or last-good) SHA. The reconciler picks it up within 20s.
- **Freeze deploys** — `systemctl stop reconciler.timer` on the VM, or pause the deploy workflow in GitHub Actions.
- **Rotate the CI key** — `pnpm --filter infra tsx tasks/rotate-ci-key.ts <stack>` (see [tasks/rotate-ci-key.ts](tasks/rotate-ci-key.ts)). It's the only credential CI holds and can only write the `deploy/` prefix.

## How config flows

```
shared/config/config.default.ts   → appConfig (slug, domain, URLs, S3 settings)
shared/config/config.production.ts → overrides for production mode
        ↓
infra/helpers.ts                  → derives all naming, domains, regions
        ↓
infra/resources/*.ts              → uses naming + infraConfig (stack secrets/sizing)
        ↓
Pulumi.<stack>.yaml               → stack-specific sizing + encrypted secrets
```

No resource names, domains, or bucket names are hardcoded in the Pulumi modules — everything flows from `appConfig`.

## Stacks

Only `production` is supported out of the box, but additional stacks (e.g. `staging`) can be added. Each stack has its own Pulumi state bucket (`<slug>-pulumi-state`, so `cella-pulumi-state` and `cella-staging-pulumi-state`) and its own scoped CI IAM application (`<slug>-ci-deploy`). The stack name is used directly as `APP_MODE` in `helpers.ts`.

To extend to a new environment, add a config file under `shared/` (e.g. `shared/qa-config.ts`) with a unique `slug`. No infra-side string surgery required.

## Credential strategy

Two Scaleway API keys exist across the lifecycle, each in a different store:

| Key | Permissions | Lifetime | Where stored |
|-----|-------------|----------|-------------|
| **Bootstrap key** | Owner (via Personal API Key) **or** ProjectManager + IAMManager on a dedicated IAM application | Minutes — revoked immediately after each use (initial bootstrap or manual rotation). Also required for any `pulumi up` that touches bootstrap-owned modules (DB, VPC, private network). | Password manager only, never on disk |
| **CI deploy key** (`<slug>-ci-deploy`) | Write on compute / LB / edge / secrets / object storage / registry; **read-only** on VPC / private network / RDB (those are bootstrap-owned). Project-scoped, plus DNS at org scope. | Long-lived; rotate manually by re-running bootstrap-style flow (see README → Key rotation) | Pulumi stack config (encrypted with `PULUMI_CONFIG_PASSPHRASE`) and the `production` GitHub Environment secrets `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` (environment-scoped, not repo-scoped) |

## Defaults per stack

All sizing has sensible defaults — DB/WAF in `helpers.ts`, per-service VM sizes in the registry. No `Pulumi.<stack>.yaml` config is needed unless you want to override:

| Setting | Staging (default) | Production (default) |
|---------|-------------------|----------------------|
| `dbNodeType` | DB-DEV-S | DB-DEV-S |
| `dbVolumeSize` | 10 GB | 10 GB |
| `instanceType` (fleet default) | DEV1-S | DEV1-S |
| `backend` VM size (registry default) | DEV1-S | DEV1-M |
| `enableWaf` | false | true |
| `enableEdgeServices` | false | false |
| `computeEnabled` | true (gated off only while `bootstrap:applyInProgress` is set) | true (same) |

`instanceType` is the fleet-wide VM size. Per-service sizes live in the
canonical registry (`compose/services.config.ts`, the `instanceType` field) so a
fork can resize its fleet by editing that one file. That field is either a
single size or a per-mode map (`{ production: 'DEV1-M', staging: 'DEV1-S' }`):
backend runs `DEV1-M` in production because its blue-green roll runs the OLD +
NEW slots side-by-side and needs ~2× steady-state RAM during cutover — DEV1-S
(2 GB) cannot hold both — but stays on `DEV1-S` in staging. VM size resolves
highest-precedence-first: `infra:instanceTypes.<slug>` (operator override) →
the registry default for the current mode → `infra:instanceType` / the fleet
default.

To override any value:

```bash
pulumi config set infra:dbNodeType DB-GP-XS
pulumi config set infra:instanceType GP1-S                   # whole fleet
pulumi config set --path infra:instanceTypes.backend DEV1-M  # one service (escape hatch)
```

## Common operations

### Deploy a new release

Routine deploys don't touch Pulumi or replace VMs — push to `main` and CI builds the images, writes the new SHA to the deploy-tags bucket, and the on-VM reconciler rolls only the app container behind the ingress (see [Zero-downtime deploys](#zero-downtime-deploys)). To roll a single service by hand, write its tag object directly (`deploy/<svc>.tag`) as described in [Operating the reconciler](#operating-the-reconciler).

### Build and push an image manually

```bash
REGISTRY=$(pulumi stack output registryEndpoint)
TAG=$(git rev-parse --short HEAD)
docker buildx build --file backend/Dockerfile --platform linux/amd64 \
  --tag "$REGISTRY/backend:$TAG" --push .
```

Then point the reconciler at it by writing the SHA to its tag object (`deploy/<svc>.tag`). Image tags live only in S3 — there is no Pulumi config or cloud-init constant to update, and pushing a tag never replaces the VM.

### Replace a VM manually

Changing any cloud-init input (new secret, reconciler script, package install) and running `pulumi up` triggers a full VM replacement (`replaceOnChanges: ['cloudInit']`). Image tags are NOT a cloud-init input — they live only in the deploy-tags bucket — so a routine release never replaces a VM; only genuine boot-script changes do. The LB health checks bridge the transition.

### Check stack outputs

```bash
pulumi stack output                                          # all outputs
pulumi stack output dbConnectionStringRuntime --show-secrets # db connection
pulumi stack output registryEndpoint                         # container registry
```

### Destroy all resources

```bash
pulumi destroy
```

> **Warning**: This deletes all resources including the database and its data.
