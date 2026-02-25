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

# Database (production-grade instance with more resources)
db_node_type      = "DB-GP-S"
db_volume_size_gb = 50

# Container scaling (always-on for production)
backend_min_scale = 2 # At least 2 for high availability
backend_max_scale = 10
backend_memory    = 1024
backend_cpu       = 1000

cdc_memory = 512
cdc_cpu    = 500

# Features (all features enabled for production)
enable_waf = true

# Image tags (use git SHA in CI/CD)
backend_image_tag = "latest"
cdc_image_tag     = "latest"
