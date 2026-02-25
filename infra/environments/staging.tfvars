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

# Database (small production-grade instance)
db_node_type      = "DB-GP-XS"
db_volume_size_gb = 20

# Container scaling (always-on minimum for staging)
backend_min_scale = 1
backend_max_scale = 5
backend_memory    = 512
backend_cpu       = 500

cdc_memory = 256
cdc_cpu    = 250

# Features (WAF enabled for staging to test)
enable_waf = true

# Image tags
backend_image_tag = "latest"
cdc_image_tag     = "latest"
