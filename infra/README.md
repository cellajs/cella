# Cella Scaleway Infrastructure

Terraform infrastructure-as-code for deploying Cella to Scaleway cloud with Neon database.

## Architecture Overview

```
                                    External Services
                              ┌──────────────────────────┐
                              │   Neon PostgreSQL 17     │
                              │   (eu-central-1)         │
                              │   - Pooled connections   │
                              │   - Logical replication  │
                              └────────────┬─────────────┘
                                           │
┌──────────────────────────────────────────┼─────────────────────────────────────┐
│                         Scaleway Cloud (nl-ams)                                │
├──────────────────────────────────────────┼─────────────────────────────────────┤
│                                          │                                      │
│  ┌────────────────────────┐              │                                      │
│  │  Object Storage (S3)   │              │                                      │
│  │  Frontend Static Files │              │                                      │
│  │  - S3 Website Hosting  │              │                                      │
│  └────────────────────────┘              │                                      │
│                                          │                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │                    Serverless Containers Namespace                      │    │
│  │  ┌──────────────────────────┐      ┌──────────────────────────┐        │    │
│  │  │   Backend Container      │      │   CDC Container          │        │    │
│  │  │   (Hono API - :4000)     │◀────▶│   (Worker - :4001)       │        │    │
│  │  │   - Auto-scaling (0-10)  │  WS  │   - Singleton (1-1)      │        │    │
│  │  │   - 1024MB RAM           │      │   - 512MB RAM            │        │    │
│  │  └─────────────┬────────────┘      └─────────────┬────────────┘        │    │
│  │                │                                 │                      │    │
│  │                └─────────────────────────────────┘                      │    │
│  │                              │                                          │    │
│  └──────────────────────────────┼──────────────────────────────────────────┘    │
│                                 │                                               │
│                                 ▼                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │              Container Registry (devcella)                              │    │
│  │              - backend:latest                                           │    │
│  │              - cdc:latest                                               │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │                        Private Network (VPC)                            │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Current Deployment

| Component | Endpoint |
|-----------|----------|
| Frontend | `https://dev-cella-frontend-v2.s3-website.nl-ams.scw.cloud` |
| Backend API | `https://devcellacontainersyssaata6-dev-cella-backend.functions.fnc.nl-ams.scw.cloud` |
| CDC Worker | `https://devcellacontainersyssaata6-dev-cella-cdc.functions.fnc.nl-ams.scw.cloud` |
| API Docs | `https://devcellacontainersyssaata6-dev-cella-backend.functions.fnc.nl-ams.scw.cloud/docs` |

## Structure

```
infra/
├── main.tf              # Root module - orchestrates all resources
├── variables.tf         # Input variables
├── outputs.tf           # Output values
├── secrets.auto.tfvars  # Secrets (gitignored)
├── environments/        # Environment-specific configurations
│   ├── dev.tfvars       # Development (scale-to-zero)
│   ├── staging.tfvars   # Staging
│   └── prod.tfvars      # Production
└── modules/             # Reusable Terraform modules
    ├── network/         # VPC and Private Network
    ├── registry/        # Container Registry
    ├── secrets/         # Secret Manager
    ├── containers/      # Serverless Containers (BE + CDC)
    ├── storage/         # Object Storage (FE + Uploads)
    ├── load-balancer/   # Load Balancer (optional)
    ├── edge/            # Edge Services (optional)
    ├── dns/             # DNS records (optional)
    └── monitoring/      # Cockpit observability
```

## Prerequisites

1. **Scaleway Account** with API keys
2. **Neon Database** account and project
3. **Terraform** >= 1.5.0
4. **Docker** for building container images
5. **AWS CLI** for S3 operations
6. **scw CLI** (optional)

## Quick Start

### 1. Configure Scaleway credentials

```bash
export SCW_ACCESS_KEY="your-access-key"
export SCW_SECRET_KEY="your-secret-key"
export SCW_DEFAULT_PROJECT_ID="your-project-id"
export SCW_DEFAULT_REGION="nl-ams"
```

### 2. Initialize Terraform

```bash
cd infra
terraform init
```

### 3. Create secrets file

Create `secrets.auto.tfvars` (gitignored):

```hcl
# secrets.auto.tfvars
database_url             = "postgresql://user:pass@host-pooler.neon.tech/db?sslmode=require"
database_admin_url       = "postgresql://user:pass@host.neon.tech/db?sslmode=require"
database_cdc_url         = "postgresql://user:pass@host.neon.tech/db?sslmode=require"
argon_secret             = "your-argon-secret-min-32-chars"
cookie_secret            = "your-cookie-secret-min-32-chars"
unsubscribe_token_secret = "your-unsubscribe-secret"
cdc_ws_secret            = "your-cdc-ws-secret-min-16-chars"
cdc_internal_secret      = "your-cdc-internal-secret"
admin_email              = "admin@example.com"
```

### 4. Deploy infrastructure

```bash
# Development environment
terraform apply -var-file="environments/dev.tfvars"
```

## Manual Deployment Steps

### 1. Build and Push Docker Images

```bash
# Login to Scaleway Registry
docker login rg.nl-ams.scw.cloud/devcella -u nologin -p $SCW_SECRET_KEY

# Build for AMD64 (required for Scaleway Serverless)
docker build --platform linux/amd64 -t rg.nl-ams.scw.cloud/devcella/backend:latest -f backend/Dockerfile .
docker build --platform linux/amd64 -t rg.nl-ams.scw.cloud/devcella/cdc:latest -f cdc/Dockerfile .

# Push images
docker push rg.nl-ams.scw.cloud/devcella/backend:latest
docker push rg.nl-ams.scw.cloud/devcella/cdc:latest
```

### 2. Deploy Frontend to S3

```bash
# Build frontend
cd frontend && pnpm build && cd ..

# Configure AWS CLI for Scaleway
aws configure set aws_access_key_id $SCW_ACCESS_KEY
aws configure set aws_secret_access_key $SCW_SECRET_KEY

# Sync to S3
aws s3 sync frontend/dist s3://dev-cella-frontend-v2/ \
  --endpoint-url https://s3.nl-ams.scw.cloud \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html"

# Upload HTML with no-cache
aws s3 cp frontend/dist/index.html s3://dev-cella-frontend-v2/index.html \
  --endpoint-url https://s3.nl-ams.scw.cloud \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"
```

### 3. Deploy/Redeploy Containers

```bash
# Deploy backend
curl -X POST "https://api.scaleway.com/containers/v1beta1/regions/nl-ams/containers/{container-id}/deploy" \
  -H "X-Auth-Token: $SCW_SECRET_KEY"

# Deploy CDC
curl -X POST "https://api.scaleway.com/containers/v1beta1/regions/nl-ams/containers/{cdc-container-id}/deploy" \
  -H "X-Auth-Token: $SCW_SECRET_KEY"
```

## Environment Variables

### Required for Containers

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon pooled connection string |
| `DATABASE_ADMIN_URL` | Neon direct connection (for migrations) |
| `DATABASE_CDC_URL` | Neon direct connection (for CDC replication) |
| `ARGON_SECRET` | Argon2id password hashing secret |
| `COOKIE_SECRET` | Cookie signing secret |
| `UNSUBSCRIBE_SECRET` | Email unsubscribe token secret |
| `CDC_WS_SECRET` | CDC WebSocket authentication |
| `CDC_INTERNAL_SECRET` | CDC internal communication secret |
| `ADMIN_EMAIL` | Admin email address |

### Container Environment

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `4000` (backend) / `4001` (CDC) |

## Database Setup (Neon)

### Connection URLs

- **Pooled** (for API): Use the `-pooler` endpoint with `uselibpqcompat=true`
- **Direct** (for migrations/CDC): Use the non-pooler endpoint

### Migration Tracking

Drizzle migrations are tracked in `drizzle-backend.__drizzle_migrations`. The `created_at` column must match the folder timestamp (UTC milliseconds).

## Monitoring

### Cockpit Logs

Access container logs via Scaleway Cockpit:

```bash
# Query logs via Loki API
curl -u "TOKEN_ID:TOKEN_SECRET" \
  'https://PROJECT_ID.logs.cockpit.nl-ams.scw.cloud/loki/api/v1/query_range' \
  --data-urlencode 'query={resource_name="container-name"}'
```

### Health Checks

- Backend: `GET /health`
- CDC: `GET /health` on port 4001

## Troubleshooting

### Container won't start

1. Check logs in Cockpit
2. Verify DATABASE_URL points to correct database
3. Ensure migrations table has correct hashes/timestamps
4. Check if image is AMD64 architecture

### Migration errors

If migrations fail with "type already exists":
1. Connect to database
2. Check `drizzle-backend.__drizzle_migrations` table
3. Update hashes and timestamps to match migration files

### Connection refused errors

- Verify container environment variables
- Check if database is accessible from Scaleway (firewall rules)
- Ensure SSL mode is correct (`sslmode=require`)

## Cost Considerations

- **Serverless Containers**: Pay per request/CPU time
- **Object Storage**: Pay for storage + egress
- **Container Registry**: Free for small images
- **Neon Database**: Separate billing (not Scaleway)

## Security Notes

1. All secrets stored in `secrets.auto.tfvars` (gitignored)
2. Containers run as non-root user
3. Database connections use SSL
4. Frontend served over HTTPS via S3 website hosting
