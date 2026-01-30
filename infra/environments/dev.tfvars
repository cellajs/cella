# Development Environment Configuration
# Usage: terraform apply -var-file="environments/dev.tfvars"

# Domain configuration
dns_zone   = "cellajs.com"
api_domain = "api.dev.cellajs.com"
app_domain = "dev.cellajs.com"

# Database (small instance for dev)
db_node_type      = "DB-DEV-S"
db_volume_size_gb = 10

# Container scaling (allow scale to zero for dev)
backend_min_scale = 0
backend_max_scale = 3
backend_memory    = 512
cdc_memory        = 256

# Features
enable_waf = false
