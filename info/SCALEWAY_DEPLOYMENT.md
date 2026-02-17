# Scaleway Deployment Guide

This document describes how to deploy Cella to Scaleway cloud infrastructure using Terraform and GitHub Actions.

## Architecture

| Service | Scaleway Product | Configuration |
|---------|------------------|---------------|
| Backend (Hono API) | Serverless Containers | Auto-scaling 0-10, 512MB RAM |
| CDC Worker | Serverless Containers | Always-on (`minScale: 1`), 256MB RAM |
| Frontend (React SPA) | Object Storage + Edge Services | Static hosting with CDN + WAF |
| Database | Managed PostgreSQL 17 | Connection pooling, logical replication |
| Routing | Load Balancer | Path-based routing, Let's Encrypt SSL |
| Secrets | Secret Manager | All sensitive env vars |
| DNS | Scaleway Domains | Automated DNS records |
| Monitoring | Cockpit | Logs and metrics dashboards |

## Infrastructure layout

```
┌─────────────────────────────────────────────────────────────────┐
│                     Scaleway Load Balancer                      │
│                    (HTTPS, Let's Encrypt)                       │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌───────────────┐           ┌───────────────┐
│  /api/* route │           │   /* route    │
│               │           │               │
│   Backend     │           │ Edge Services │
│   Container   │           │ (Frontend CDN)│
│   (Hono API)  │           │               │
└───────┬───────┘           └───────┬───────┘
        │                           │
        │                           ▼
        │                   ┌───────────────┐
        │                   │ Object Storage│
        │                   │ (Static SPA)  │
        │                   └───────────────┘
        │
        ├─── WebSocket ───┐
        │                 │
        ▼                 ▼
┌───────────────┐   ┌───────────────┐
│  PostgreSQL   │   │  CDC Worker   │
│  (Managed)    │◄──│  Container    │
│ + Pooler      │   │ (Replication) │
└───────────────┘   └───────────────┘
```

## Prerequisites

1. **Scaleway Account** with a project created
2. **Domain** managed in Scaleway Domains (or point nameservers to Scaleway)
3. **Terraform** >= 1.5.0 installed locally
4. **GitHub repository** with Actions enabled

## Initial setup

### 1. Create Scaleway API keys

In Scaleway Console → IAM → API Keys:
- Create an API key with `ProjectManager` permissions
- Note the `Access Key` and `Secret Key`

### 2. Create Terraform state bucket

```bash
# Install Scaleway CLI
brew install scw  # or see https://github.com/scaleway/scaleway-cli

# Configure CLI
scw init

# Create state bucket (one-time setup)
scw object bucket create name=cella-terraform-state region=nl-ams
```

### 3. Configure GitHub secrets

In your GitHub repository → Settings → Secrets and variables → Actions:

| Secret | Description |
|--------|-------------|
| `SCW_ACCESS_KEY` | Scaleway API access key |
| `SCW_SECRET_KEY` | Scaleway API secret key |
| `SCW_PROJECT_ID` | Scaleway project ID |
| `ARGON_SECRET` | Password hashing secret (generate with `openssl rand -hex 32`) |
| `COOKIE_SECRET` | Cookie signing secret (generate with `openssl rand -hex 32`) |
| `UNSUBSCRIBE_TOKEN_SECRET` | Email token secret (generate with `openssl rand -hex 32`) |
| `CDC_WS_SECRET` | CDC WebSocket auth (min 16 chars, generate with `openssl rand -hex 16`) |

### 4. Configure GitHub environment variables

For each environment (`dev`, `staging`, `prod`), create environment-specific variables:

| Variable | Example (prod) |
|----------|----------------|
| `BACKEND_URL` | `https://api.cellajs.com` |
| `FRONTEND_URL` | `https://cellajs.com` |

### 5. Initialize DNS zone

Ensure your domain is configured in Scaleway Domains. Update the `dns_zone` in your environment tfvars files.

## Deployment

### Automatic deployment (production)

Pushing to `main` branch automatically deploys to production:

```bash
git push origin main
```

### Manual deployment (any environment)

1. Go to Actions → "Deploy to Scaleway"
2. Click "Run workflow"
3. Select environment (`dev`, `staging`, or `prod`)

### Local Terraform operations

For debugging or manual changes:

```bash
cd infra

# Initialize
terraform init \
  -backend-config="bucket=cella-terraform-state" \
  -backend-config="key=dev/terraform.tfstate" \
  -backend-config="region=nl-ams" \
  -backend-config="endpoint=s3.nl-ams.scw.cloud" \
  -backend-config="skip_credentials_validation=true" \
  -backend-config="skip_region_validation=true"

# Select workspace
terraform workspace select dev

# Plan
terraform plan -var-file="environments/dev.tfvars"

# Apply
terraform apply -var-file="environments/dev.tfvars"
```

## Environment configuration

Each environment has its own tfvars file in `infra/environments/`:

| File | Purpose |
|------|---------|
| `dev.tfvars` | Development (scale-to-zero, no WAF) |
| `staging.tfvars` | Staging (always-on, WAF enabled) |
| `prod.tfvars` | Production (full scaling, HA database) |

## Database connections

The infrastructure uses split database URLs:

| URL | Used By | Purpose |
|-----|---------|---------|
| `DATABASE_URL_POOLED` | Backend API | Connection pooler (port 6432), efficient for HTTP requests |
| `DATABASE_URL_DIRECT` | CDC Worker, Migrations | Direct connection (port 5432), required for logical replication |

## Secrets management

All secrets are stored in Scaleway Secret Manager and mounted into containers at runtime:

```
{env}/cella/database-url-direct
{env}/cella/database-url-pooled
{env}/cella/argon-secret
{env}/cella/cookie-secret
{env}/cella/unsubscribe-token-secret
{env}/cella/cdc-ws-secret
```

Containers reference secrets directly (not Terraform-rendered plaintext).

## Monitoring

### Cockpit dashboards

Access Grafana dashboards via Scaleway Console → Cockpit → Open Grafana.

Pre-configured views:
- Container metrics (CPU, memory, requests)
- Database metrics (connections, queries, replication lag)
- Load Balancer metrics (requests, latency, errors)

### Health endpoints

| Endpoint | Description |
|----------|-------------|
| `https://api.{domain}/health` | Backend health |
| `https://api.{domain}/cdc/health` | CDC worker health |

## Troubleshooting

### Container not starting

```bash
# Check container logs
scw container container logs container-id=<id>

# Check container status
scw container container get container-id=<id>
```

### Database connection issues

```bash
# Verify PostgreSQL is accessible
scw rdb instance get instance-id=<id>

# Check private network connectivity
scw vpc private-network get private-network-id=<id>
```

### CDC replication slot issues

If CDC fails to connect:
1. Check `max_replication_slots` is sufficient
2. Verify `wal_level=logical` is set
3. Check CDC worker logs for connection errors

```bash
# List replication slots (via psql)
SELECT * FROM pg_replication_slots;

# Drop orphaned slot if needed
SELECT pg_drop_replication_slot('cdc_slot');
```

## Cost estimates

| Resource | Estimated Monthly Cost (EUR) |
|----------|------------------------------|
| Load Balancer (LB-S) | ~10 |
| PostgreSQL (DB-DEV-S) | ~12 |
| Serverless Containers (dev) | ~5-15 |
| Object Storage (10GB) | ~1 |
| Edge Services | ~5 |
| **Total (dev)** | **~35-45** |

Production costs scale with:
- Database tier (DB-GP-S: ~50 EUR)
- Container scaling (per invocation)
- Bandwidth usage

## Upgrading

### Schema migrations

Migrations run automatically on backend container startup. For manual migrations:

```bash
# SSH into a running container or use local connection
cd backend
pnpm drizzle-kit push
```

### Rolling back

```bash
cd infra
terraform workspace select prod

# Revert to previous image tag
terraform apply -var-file="environments/prod.tfvars" \
  -var="backend_image_tag=<previous-sha>" \
  -var="cdc_image_tag=<previous-sha>"
```

## Security considerations

- All traffic uses TLS (Let's Encrypt)
- Database accessible only via private network
- Secrets stored in Secret Manager (not environment variables)
- WAF enabled on production Edge Services
- Containers run as non-root user
- OWASP headers configured on frontend
