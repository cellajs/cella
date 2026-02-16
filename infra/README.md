# Cella Scaleway Infrastructure

Terraform infrastructure-as-code for deploying Cella to Scaleway cloud.

## Structure

```
infra/
├── main.tf              # Root module - orchestrates all resources
├── variables.tf         # Input variables
├── outputs.tf           # Output values
├── environments/        # Environment-specific configurations
│   ├── dev.tfvars
│   ├── staging.tfvars
│   └── prod.tfvars
└── modules/             # Reusable Terraform modules
    ├── network/         # VPC and Private Network
    ├── database/        # Managed PostgreSQL
    ├── registry/        # Container Registry
    ├── secrets/         # Secret Manager
    ├── containers/      # Serverless Containers
    ├── storage/         # Object Storage buckets
    ├── load-balancer/   # Load Balancer with routes
    ├── edge/            # Edge Services (CDN + WAF)
    ├── dns/             # DNS records
    └── monitoring/      # Cockpit observability
```

## Quick start

See [info/SCALEWAY_DEPLOYMENT.md](../info/SCALEWAY_DEPLOYMENT.md) for full setup instructions.

```bash
# Initialize
terraform init -backend-config="bucket=cella-terraform-state" ...

# Create/select workspace
terraform workspace new dev  # or: terraform workspace select dev

# Plan
terraform plan -var-file="environments/dev.tfvars"

# Apply
terraform apply -var-file="environments/dev.tfvars"
```

## Environment naming

Resources follow the pattern `{env}-cella-{resource}`:

- `dev-cella-backend` - Development backend container
- `prod-cella-postgres` - Production PostgreSQL instance
- `staging-cella-frontend` - Staging frontend bucket

## Required secrets

Pass these via `-var` or environment variables:

- `argon_secret` - Password hashing
- `cookie_secret` - Cookie signing  
- `unsubscribe_token_secret` - Email tokens
- `cdc_ws_secret` - CDC WebSocket auth (min 16 chars)

## Workspaces

Use Terraform workspaces for environment isolation:

```bash
terraform workspace list
terraform workspace select prod
```

Each workspace has separate state in `{env}/terraform.tfstate`.
