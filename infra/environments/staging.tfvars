# Staging Environment Configuration
# Usage: terraform apply -var-file="environments/staging.tfvars"

# Domain configuration
dns_zone   = "cellajs.com"
api_domain = "api.staging.cellajs.com"
app_domain = "staging.cellajs.com"

# Database (small instance for staging)
db_node_type      = "DB-GP-XS"
db_volume_size_gb = 20

# Container scaling
backend_min_scale = 1
backend_max_scale = 5
backend_memory    = 512
cdc_memory        = 256

# Features
enable_waf = true
