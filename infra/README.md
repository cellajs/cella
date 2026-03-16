# Cella Scaleway Infrastructure

Terraform configuration for deploying Cella's Backend API and CDC Worker as Serverless Containers on Scaleway.

## Structure

```
infra/
├── README.md
└── deploy/
    ├── main.tf          # All resources, variables, and outputs in one file
    └── dev.tfvars       # Environment-specific values (gitignored)
```

## Quick start

```bash
cd infra/deploy

# Initialize Terraform
terraform init

# Plan and apply
terraform plan -var-file="dev.tfvars" -out=tfplan
terraform apply "tfplan"
```

## What gets created

- **Container Registry** — private registry at `rg.nl-ams.scw.cloud/devcella`
- **Container Namespace** — groups backend + CDC containers
- **Backend Container** — public Hono API server (auto-scales 0-3, 1024 MB, port 4000)
- **CDC Container** — private replication worker (always-on 1:1, 512 MB, port 4001)

The database is external (e.g. Neon) and not managed by Terraform.

## Required variables

Create a `dev.tfvars` file with all required values. See [info/SCALEWAY_DEPLOYMENT.md](../info/SCALEWAY_DEPLOYMENT.md) for a full example and detailed instructions.

Key secrets (generate with `openssl rand -hex 32`):

- `database_url` / `database_admin_url` / `database_cdc_url` — PostgreSQL connection strings
- `argon_secret` — password hashing
- `cookie_secret` — cookie signing
- `unsubscribe_secret` — email unsubscribe tokens
- `cdc_internal_secret` — backend<->CDC shared auth (min 16 chars)

## Deploy images

From the repo root:

```bash
# Build for linux/amd64 and push
docker buildx build --platform linux/amd64 -t rg.nl-ams.scw.cloud/devcella/backend:latest -f backend/Dockerfile --push .
docker buildx build --platform linux/amd64 -t rg.nl-ams.scw.cloud/devcella/cdc:latest -f cdc/Dockerfile --push .

# Redeploy containers
scw container container deploy <backend-id> region=nl-ams
scw container container deploy <cdc-id> region=nl-ams
```

## Full documentation

See [info/SCALEWAY_DEPLOYMENT.md](../info/SCALEWAY_DEPLOYMENT.md) for:

- Architecture diagram
- Environment variable reference
- Secret management practices
- Gotchas (SSL, BYPASSRLS, migrations)
- Troubleshooting
