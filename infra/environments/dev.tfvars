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

# Database (smallest instance for dev)
db_node_type      = "DB-DEV-S"
db_volume_size_gb = 10

# Container scaling (scale to zero for dev - cost savings)
# Note: Scaleway requires memory >= CPU (e.g., 500 mvCPU needs min 500 MB)
backend_min_scale = 0
backend_max_scale = 3
backend_memory    = 1024
backend_cpu       = 1000

cdc_memory = 512
cdc_cpu    = 500

# Features
enable_waf = false

# Image tags (use 'latest' for dev)
backend_image_tag = "latest"
cdc_image_tag     = "latest"
