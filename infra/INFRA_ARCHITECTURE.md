# Infrastructure architecture

> For deployment instructions see [README.md](./README.md). For self-hosted (no Scaleway) see [STANDALONE.md](./STANDALONE.md).

## Layers

The infrastructure is organised in 7 phases, deployed in dependency order:

| Layer | Module | Resources |
|-------|--------|-----------|
| 1 | `storage` | Frontend bucket (SPA hosting), public & private upload buckets |
| 2 | `edge`, `dns` | Edge Services CDN pipeline, WAF, TLS certs, DNS records |
| 3 | `network`, `registry` | VPC, private networks, container registry |
| 4 | `database` | Managed PostgreSQL 17 (HA + backups in production) |
| 5 | `secrets`, `compute` | Secret Manager, Docker Compose VMs (one per service) |
| 6 | `loadbalancer` | Scaleway LB with TLS termination, host-header routing, DNS |
| 7 | `monitoring` | Cockpit observability, Grafana, alert manager |

## Compute layer

Backend services run on individual Scaleway VMs (DEV1-S by default), each provisioned with cloud-init that installs Docker, writes the shared `compose.yml` + `.env`, and starts a single service profile. A [Scaleway Load Balancer](https://www.scaleway.com/en/load-balancer/) (LB-S) provides TLS termination via Let's Encrypt, host-header routing, and health checks. All VMs and the LB sit on a private network alongside the managed database.

| Service | VM | Port | Profile | Notes |
|---------|---|------|---------|-------|
| Backend API | `backend` | 4000 | `backend` | Hono API server, SSE streams |
| CDC Worker | `cdc` | 4001 | `cdc` | Singleton (`deleteBeforeReplace`) for replication slot |
| Yjs Relay | `yjs` | 4002 | `yjs` | WebSocket relay, LB timeouts set to 1h |
| AI Worker | `ai` | 4003 | `ai` | AI inference API |

Image tag changes update cloud-init content → Pulumi replaces the VM. The LB health checks handle the transition gracefully.

## How config flows

```
shared/default-config.ts          → appConfig (slug, domain, URLs, S3 settings)
shared/production-config.ts       → overrides for production mode
        ↓
infra/helpers.ts                  → derives all naming, domains, regions
        ↓
infra/modules/*.ts                → uses naming + infraConfig (stack secrets/sizing)
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

All sizing has mode-aware defaults in `helpers.ts`. No `Pulumi.<stack>.yaml` config is needed unless you want to override:

| Setting | Staging (default) | Production (default) |
|---------|-------------------|----------------------|
| `dbNodeType` | DB-GP-XS | DB-GP-S |
| `dbVolumeSize` | 20 GB | 50 GB |
| `instanceType` | DEV1-S | DEV1-S |
| `enableWaf` | true | true |
| `deployCompute` | false | false |

To override any value:

```bash
pulumi config set infra:dbNodeType DB-GP-XS
pulumi config set infra:instanceType GP1-S
```

## Common operations

### Update a container image

```bash
REGISTRY=$(pulumi stack output registryEndpoint)
TAG=$(git rev-parse --short HEAD)
docker buildx build --file backend/Dockerfile --platform linux/amd64 \
  --tag "$REGISTRY/backend:$TAG" --push .
pulumi config set infra:backendImageTag "$TAG"
pulumi up
```

### Replace a VM manually

To force-replace a VM (e.g. to pick up new secrets), change the image tag or bump a config value and run `pulumi up`. Cloud-init changes trigger a full VM replacement — the LB health checks handle the transition.

### Check stack outputs

```bash
pulumi stack output                                    # all outputs
pulumi stack output dbConnectionStringDirect --show-secrets  # db connection
pulumi stack output registryEndpoint                   # container registry
```

### Destroy all resources

```bash
pulumi destroy
```

> **Warning**: This deletes all resources including the database and its data.
