# =============================================================================
# Development Environment Configuration (No Custom Domain)
# =============================================================================
# Usage: terraform apply -var-file="environments/dev.tfvars"
# =============================================================================

environment = "dev"

# Scaleway project ID
scaleway_project_id = "1e1cc7b8-1b0d-4f8b-872e-a867257f532b"

# Domain configuration (placeholders - not used when enable_custom_domain=false)
dns_zone   = "example.com"
api_domain = "api.example.com"
app_domain = "app.example.com"

# Disable custom domain features for initial deployment
# This skips DNS, Edge Services, and Load Balancer
# You can enable this later when you have a domain
enable_custom_domain = false

# Database is hosted externally on Neon PostgreSQL
# database_url and database_url_direct are passed via TF_VAR_ environment variables
# (they contain sensitive credentials and should not be stored in .tfvars)

# Container scaling (scale to zero for dev - cost savings)
# Note: Scaleway has fixed memory/CPU tiers:
#   1024 MB = 560 mvCPU, 2048 MB = 1120 mvCPU, 512 MB = 280 mvCPU
backend_min_scale = 0
backend_max_scale = 3
backend_memory    = 1024
backend_cpu       = 560

cdc_memory = 512
cdc_cpu    = 280

# Features
enable_waf = false

# Image tags (use 'latest' for dev)
backend_image_tag = "latest"
cdc_image_tag     = "latest"

# Bucket suffix (for recreating locked buckets)
bucket_suffix = "-v2"

# Admin
admin_email = "flip@cellajs.com"
