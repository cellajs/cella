# Scaleway Deployment Guide

Deploy Cella's Backend API and CDC Worker as Serverless Containers on Scaleway, managed with Terraform.

## Architecture

```
                    Internet
                       │
                       ▼
              ┌────────────────┐
              │ Backend API    │  Serverless Container (public)
              │ Hono on :4000  │  Auto-scales 0-3, 1024 MB
              └───────┬────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
         ▼            ▼            ▼
  ┌────────────┐ ┌─────────┐ ┌────────────┐
  │ PostgreSQL │ │ WebSocket│ │ CDC Worker  │  Serverless Container (private)
  │ (External) │ │ /internal│ │ Replication │  Always-on (1:1), 512 MB
  │ e.g. Neon  │ │ /cdc     │ │ on :4001    │
  └────────────┘ └─────────┘ └─────┬──────┘
                                   │
                                   ▼
                            ┌────────────┐
                            │ PostgreSQL │
                            │ (External) │
                            └────────────┘
```

| Service            | Scaleway Product      | Notes                                                            |
| ------------------ | --------------------- | ---------------------------------------------------------------- |
| Backend (Hono API) | Serverless Containers | Public, auto-scaling 0-3, health check on `/health`              |
| CDC Worker         | Serverless Containers | Private, always-on (min/max scale = 1)                           |
| Database           | External (e.g. Neon)  | Not managed by Terraform; connection strings passed as variables |
| Container Registry | Scaleway Registry     | Private registry `rg.nl-ams.scw.cloud/devcella`                  |

## Prerequisites

- [Scaleway CLI](https://github.com/scaleway/scaleway-cli) (`brew install scw && scw init`)
- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5.0
- [Docker](https://docs.docker.com/get-docker/) with buildx (for cross-platform `linux/amd64` builds)
- A PostgreSQL database with logical replication enabled (e.g. Neon, Scaleway Managed, Supabase)

## Directory structure

```
infra/
└── deploy/
    ├── main.tf          # All resources: registry, containers, variables, outputs
    └── dev.tfvars       # Environment-specific variable values (DO NOT commit)
```

## Quick start

### 1. Authenticate

```bash
# Scaleway CLI (for manual container operations)
scw init

# Docker registry login
docker login rg.nl-ams.scw.cloud/devcella -u nologin --password-stdin <<< "$(scw iam api-key get $(scw iam api-key list -o json | jq -r '.[0].access_key') -o json | jq -r '.secret_key')"
```

### 2. Create `dev.tfvars`

Copy the example below and fill in your values. **Never commit this file** (it's in `.gitignore`).

```hcl
# infra/deploy/dev.tfvars

environment = "dev"
region      = "nl-ams"
zone        = "nl-ams-1"

# Domain
api_domain = "api.dev.cellajs.com"
app_domain = "dev.cellajs.com"

# Database URLs (e.g. from Neon — use sslmode=no-verify for Node.js pg v8+ compatibility)
database_url       = "postgresql://runtime_role:PASSWORD@HOST/DB?sslmode=no-verify"
database_admin_url = "postgresql://admin_user:PASSWORD@HOST/DB?sslmode=no-verify"
database_cdc_url   = "postgresql://cdc_role:PASSWORD@HOST/DB?sslmode=no-verify"

# Secrets (generate with: openssl rand -hex 32)
argon_secret        = ""
cookie_secret       = ""
session_secret      = ""
unsubscribe_secret  = ""
cdc_internal_secret = ""  # min 16 chars

# App config
admin_email               = "admin@example.com"
system_admin_ip_allowlist = "*"

# Third-party (optional, leave empty if unused)
brevo_api_key        = ""
github_client_id     = ""
github_client_secret = ""
s3_access_key_id     = ""
s3_access_key_secret = ""
transloadit_key      = ""
transloadit_secret   = ""
```

### 3. Initialize Terraform

```bash
cd infra/deploy
terraform init
```

### 4. Plan and apply

```bash
terraform plan -var-file="dev.tfvars" -out=tfplan
terraform apply "tfplan"
```

This creates: a container registry, a container namespace, a backend container, and a CDC container.

### 5. Build and push Docker images

Images must be built for `linux/amd64` (Scaleway doesn't support ARM). Run from the **repo root**:

```bash
# Backend
docker buildx build \
  --platform linux/amd64 \
  -t rg.nl-ams.scw.cloud/devcella/backend:latest \
  -f backend/Dockerfile \
  --push .

# CDC Worker
docker buildx build \
  --platform linux/amd64 \
  -t rg.nl-ams.scw.cloud/devcella/cdc:latest \
  -f cdc/Dockerfile \
  --push .
```

### 6. Deploy containers

After pushing new images, redeploy the containers:

```bash
# Get container IDs from Terraform output or Scaleway console
scw container container deploy <backend-container-id> region=nl-ams
scw container container deploy <cdc-container-id> region=nl-ams
```

Or re-run `terraform apply` which sets `deploy = true` on both containers.

## Environment variables

Terraform splits env vars into two categories for each container:

### Backend

| Type   | Variable                    | Description                                                          |
| ------ | --------------------------- | -------------------------------------------------------------------- |
| Plain  | `NODE_ENV`                  | Always `production` (required for correct appConfig and pnpm --prod) |
| Plain  | `TZ`                        | `UTC`                                                                |
| Plain  | `FRONTEND_URL`              | e.g. `https://dev.cellajs.com`                                       |
| Plain  | `BACKEND_URL`               | e.g. `https://api.dev.cellajs.com`                                   |
| Plain  | `DEV_MODE`                  | `core` (no CDC WebSocket server in dev)                              |
| Plain  | `ADMIN_EMAIL`               | System admin email                                                   |
| Plain  | `SYSTEM_ADMIN_IP_ALLOWLIST` | IP allowlist (`*` for any)                                           |
| Secret | `DATABASE_URL`              | Runtime DB connection string                                         |
| Secret | `DATABASE_ADMIN_URL`        | Admin/migration DB connection string                                 |
| Secret | `ARGON_SECRET`              | Argon2 hashing secret                                                |
| Secret | `COOKIE_SECRET`             | Cookie signing secret                                                |
| Secret | `SESSION_SECRET`            | Session encryption secret                                            |
| Secret | `UNSUBSCRIBE_SECRET`        | Email unsubscribe token secret                                       |
| Secret | `CDC_INTERNAL_SECRET`       | Backend<->CDC shared auth secret                                     |
| Secret | `BREVO_API_KEY`             | Email provider API key                                               |
| Secret | `GITHUB_CLIENT_ID`          | OAuth client ID                                                      |
| Secret | `GITHUB_CLIENT_SECRET`      | OAuth client secret                                                  |
| Secret | `S3_ACCESS_KEY_ID`          | Object storage access key                                            |
| Secret | `S3_ACCESS_KEY_SECRET`      | Object storage secret                                                |
| Secret | `TRANSLOADIT_KEY`           | File processing key                                                  |
| Secret | `TRANSLOADIT_SECRET`        | File processing secret                                               |

### CDC Worker

| Type   | Variable              | Description                                                             |
| ------ | --------------------- | ----------------------------------------------------------------------- |
| Plain  | `NODE_ENV`            | Always `production`                                                     |
| Plain  | `TZ`                  | `UTC`                                                                   |
| Plain  | `DEV_MODE`            | `full` (CDC requires `full` or `NODE_ENV=production`)                   |
| Plain  | `CDC_HEALTH_PORT`     | `4001`                                                                  |
| Plain  | `API_WS_URL`          | WebSocket URL to backend, e.g. `wss://api.dev.cellajs.com/internal/cdc` |
| Secret | `DATABASE_CDC_URL`    | CDC replication DB connection string                                    |
| Secret | `CDC_INTERNAL_SECRET` | Shared auth secret (same value as backend)                              |

> **Important**: Do NOT set `PORT` — Scaleway reserves it and sets it automatically.

> **Why `secret_environment_variables`?** Scaleway encrypts these at rest and hides them from API responses and the console. Plain `environment_variables` are visible to anyone with API/console access.

## Secret management

### What Terraform `sensitive = true` does and does NOT do

- It hides values from `terraform plan` output and CLI logs.
- It does **NOT** encrypt values in the state file — they're stored as plain text in `terraform.tfstate`.

### Recommendations

1. **Never commit `dev.tfvars`** — it contains all secrets in plain text. The `.gitignore` has rules for `*.tfvars` (with an exception for `*.tfvars.example`).
2. **Never commit `terraform.tfstate*`** — also contains secrets. Also in `.gitignore`.
3. Use `secret_environment_variables` in `main.tf` (already done) so secrets are encrypted by Scaleway.
4. For teams: consider a remote state backend (S3 bucket with encryption) instead of local state.

## Gotchas and known issues

### SSL: `sslmode=require` fails with Node.js pg v8+

Node.js `pg` v8+ treats `sslmode=require` as `verify-full`, which fails against Scaleway/Neon certificates. Use `sslmode=no-verify` in all database connection strings.

### `BYPASSRLS` and `REPLICATION` not allowed on Scaleway Managed PostgreSQL

Scaleway's managed PostgreSQL doesn't allow `BYPASSRLS` or `REPLICATION` on custom roles. The `create-db-roles.ts` script handles this with `EXCEPTION WHEN OTHERS` fallbacks — it tries with the privilege first, then creates without it if the provider blocks it.

### `GRANT role TO CURRENT_USER` for migrations

Drizzle migrations need to `ALTER TABLE ... OWNER TO admin_role`. This requires the migration user to be a member of `admin_role`. The role setup script runs `GRANT runtime_role/cdc_role/admin_role TO CURRENT_USER` to enable this.

### CDC tsup build: shared subpath exports

The CDC worker bundles backend code via tsup. Shared package subpath exports (e.g. `shared/nanoid`, `shared/tracing`) need explicit esbuild aliases in `cdc/tsup.config.ts` because tsup/esbuild doesn't resolve `exports` map entries from `package.json`.

### Drizzle runtime migrations

The backend runs Drizzle migrations on startup (`backend/src/main.ts`). This requires:

- Flat `.sql` files in `backend/drizzle/` (e.g. `20260312082556_early_scarecrow.sql`)
- A `backend/drizzle/meta/_journal.json` with entries for each migration

The subdirectory format (`backend/drizzle/<name>/migration.sql`) is for `drizzle-kit` only and not used by the runtime migrator.

## Useful commands

```bash
# View container logs
scw container container logs container-id=<id> region=nl-ams

# Check container status
scw container container get container-id=<id> region=nl-ams

# List containers in namespace
scw container container list namespace-id=<namespace-id> region=nl-ams

# Redeploy after pushing new image
scw container container deploy <container-id> region=nl-ams

# Full rebuild + deploy cycle (from repo root)
docker buildx build --platform linux/amd64 -t rg.nl-ams.scw.cloud/devcella/backend:latest -f backend/Dockerfile --push .
scw container container deploy <backend-container-id> region=nl-ams

# Terraform operations (from infra/deploy/)
terraform plan -var-file="dev.tfvars" -out=tfplan
terraform apply "tfplan"
terraform output                    # show endpoints
terraform state list                # list managed resources
terraform destroy -var-file="dev.tfvars"  # tear everything down
```

## Troubleshooting

### Container stuck in "creating" or "error" state

```bash
# Check status
scw container container get container-id=<id> region=nl-ams

# If stuck, delete and let Terraform recreate it
scw container container delete container-id=<id> region=nl-ams
terraform apply -var-file="dev.tfvars"
```

### CDC not connecting to backend WebSocket

1. Verify `API_WS_URL` points to the correct backend domain with `wss://` protocol
2. Verify `CDC_INTERNAL_SECRET` matches between backend and CDC containers
3. Check CDC logs for connection errors: `scw container container logs container-id=<id> region=nl-ams`

### Database connection failures

1. Ensure `sslmode=no-verify` in all connection strings
2. Verify the database allows connections from Scaleway's IP ranges
3. Check that the database has logical replication enabled (`wal_level=logical`)
4. Verify replication slots: `SELECT * FROM pg_replication_slots;`

### Health check failures

The backend health check hits `GET /health` every 10s with a failure threshold of 30. If the container fails health checks:

1. Check logs for startup errors (missing env vars, DB connection failures)
2. Verify `DATABASE_URL` and `DATABASE_ADMIN_URL` are reachable from Scaleway
3. The backend runs migrations on startup — slow migrations can cause initial health check failures (the high failure threshold of 30 accounts for this)
