# Production Environment Configuration
# Usage: terraform apply -var-file="environments/prod.tfvars"

# Domain configuration
dns_zone   = "cellajs.com"
api_domain = "api.cellajs.com"
app_domain = "cellajs.com"

# Database (production-grade instance)
db_node_type      = "DB-GP-S"
db_volume_size_gb = 50

# Container scaling (always-on for production)
backend_min_scale = 1
backend_max_scale = 10
backend_memory    = 512
cdc_memory        = 256

# Features
enable_waf = true
