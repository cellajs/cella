# =============================================================================
# Production Environment Configuration
# =============================================================================
# Usage: terraform apply -var-file="environments/prod.tfvars"
# =============================================================================

environment = "prod"

# Domain configuration
dns_zone   = "cellajs.com"
api_domain = "api.cellajs.com"
app_domain = "cellajs.com"

# Database hosted externally on Neon PostgreSQL
# database_url, database_url_direct, and database_url_cdc are passed via TF_VAR_ environment variables

# Container scaling (always-on for production)
backend_min_scale = 2 # At least 2 for high availability
backend_max_scale = 10
backend_memory    = 1024
backend_cpu       = 560

cdc_memory = 512
cdc_cpu    = 280

# Features (all features enabled for production)
enable_waf = true

# Image tags (use git SHA in CI/CD)
backend_image_tag = "latest"
cdc_image_tag     = "latest"

# Admin
admin_email = "admin@cellajs.com"
