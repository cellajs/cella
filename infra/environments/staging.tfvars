# =============================================================================
# Staging Environment Configuration
# =============================================================================
# Usage: terraform apply -var-file="environments/staging.tfvars"
# =============================================================================

environment = "staging"

# Domain configuration
dns_zone   = "cellajs.com"
api_domain = "api.staging.cellajs.com"
app_domain = "staging.cellajs.com"

# Database hosted externally on Neon PostgreSQL
# database_url, database_url_direct, and database_url_cdc are passed via TF_VAR_ environment variables

# Container scaling (always-on minimum for staging)
backend_min_scale = 1
backend_max_scale = 5
backend_memory    = 1024
backend_cpu       = 560

cdc_memory = 512
cdc_cpu    = 280

# Features (WAF enabled for staging to test)
enable_waf = true

# Image tags
backend_image_tag = "latest"
cdc_image_tag     = "latest"

# Admin
admin_email = "admin@cellajs.com"
