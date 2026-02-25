# =============================================================================
# Cella Infrastructure - Scaleway Terraform
# =============================================================================
# Complete infrastructure for deploying Cella:
# - PostgreSQL 17 Database (with CDC/logical replication)
# - Backend API (Serverless Container)
# - CDC Worker (Serverless Container)
# - Frontend (Object Storage + Edge Services CDN)
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.40"
    }
  }

  # Uncomment to use remote state (recommended for team environments)
  # backend "s3" {
  #   bucket                      = "cella-terraform-state"
  #   key                         = "cella/terraform.tfstate"
  #   region                      = "nl-ams"
  #   endpoint                    = "https://s3.nl-ams.scw.cloud"
  #   skip_credentials_validation = true
  #   skip_region_validation      = true
  #   skip_metadata_api_check     = true
  # }
}

provider "scaleway" {
  region = var.region
  zone   = var.zone
}

# -----------------------------------------------------------------------------
# Local Variables
# -----------------------------------------------------------------------------

locals {
  tags        = ["app:cella", "env:${var.environment}", "managed-by:terraform"]
  name_prefix = "${var.environment}-cella"

  # URLs for the services (will be updated after containers are created)
  frontend_url = var.enable_custom_domain ? "https://${var.app_domain}" : "https://${local.name_prefix}-frontend.s3-website.${var.region}.scw.cloud"
  backend_url  = var.enable_custom_domain ? "https://${var.api_domain}" : "https://placeholder.functions.fnc.${var.region}.scw.cloud"
}

# =============================================================================
# NETWORKING
# =============================================================================

module "network" {
  source = "./modules/network"

  name_prefix = local.name_prefix
  region      = var.region
  tags        = local.tags
}

# =============================================================================
# DATABASE - PostgreSQL 17 with CDC Support
# =============================================================================

module "database" {
  source = "./modules/database"

  name_prefix        = local.name_prefix
  region             = var.region
  node_type          = var.db_node_type
  volume_size_gb     = var.db_volume_size_gb
  private_network_id = module.network.private_network_id
  tags               = local.tags
}

# =============================================================================
# CONTAINER REGISTRY
# =============================================================================

module "registry" {
  source = "./modules/registry"

  name_prefix = local.name_prefix
  region      = var.region
}

# =============================================================================
# SECRETS MANAGER
# =============================================================================

module "secrets" {
  source = "./modules/secrets"

  name_prefix              = local.name_prefix
  env                      = var.environment
  region                   = var.region
  database_url_pooled      = module.database.connection_string_pooled
  database_url_direct      = module.database.connection_string_direct
  argon_secret             = var.argon_secret
  cookie_secret            = var.cookie_secret
  unsubscribe_token_secret = var.unsubscribe_token_secret
  cdc_ws_secret            = var.cdc_ws_secret
  tags                     = local.tags
}

# =============================================================================
# SERVERLESS CONTAINERS - Backend API + CDC Worker
# =============================================================================

module "containers" {
  source = "./modules/containers"

  name_prefix        = local.name_prefix
  env                = var.environment
  region             = var.region
  registry_endpoint  = module.registry.endpoint
  private_network_id = module.network.private_network_id

  # Backend configuration
  backend_image_tag = var.backend_image_tag
  backend_min_scale = var.backend_min_scale
  backend_max_scale = var.backend_max_scale
  backend_memory    = var.backend_memory
  backend_cpu       = var.backend_cpu

  # CDC configuration
  cdc_image_tag = var.cdc_image_tag
  cdc_memory    = var.cdc_memory
  cdc_cpu       = var.cdc_cpu

  # URLs (will use container's own domain if no custom domain)
  frontend_url = local.frontend_url
  backend_url  = local.backend_url

  # Secret references (from secrets module)
  secret_ids = module.secrets.secret_ids

  tags = local.tags

  depends_on = [module.database, module.secrets]
}

# =============================================================================
# OBJECT STORAGE - Frontend Static Files + Uploads
# =============================================================================

module "storage" {
  source = "./modules/storage"

  name_prefix   = local.name_prefix
  region        = var.region
  project_id    = var.scaleway_project_id
  bucket_suffix = "-v2" # Suffix to avoid locked buckets from failed deployment
  tags          = local.tags
}

# =============================================================================
# EDGE SERVICES - CDN + WAF for Frontend (Optional - requires custom domain)
# =============================================================================

module "edge" {
  count  = var.enable_custom_domain ? 1 : 0
  source = "./modules/edge"

  name_prefix        = local.name_prefix
  region             = var.region
  frontend_bucket_id = module.storage.frontend_bucket_id
  app_domain         = var.app_domain
  enable_waf         = var.enable_waf
}

# =============================================================================
# LOAD BALANCER - API Routing (Optional - requires custom domain)
# =============================================================================

module "load_balancer" {
  count  = var.enable_custom_domain ? 1 : 0
  source = "./modules/load-balancer"

  name_prefix                = local.name_prefix
  region                     = var.region
  zone                       = var.zone
  private_network_id         = module.network.private_network_id
  backend_container_endpoint = module.containers.backend_endpoint
  cdc_container_endpoint     = module.containers.cdc_endpoint
  frontend_bucket_endpoint   = module.storage.frontend_bucket_website_endpoint
  api_domain                 = var.api_domain
  app_domain                 = var.app_domain
  ssl_certificate_id         = var.ssl_certificate_id
  tags                       = local.tags

  depends_on = [module.containers]
}

# =============================================================================
# DNS RECORDS (Optional - requires custom domain)
# =============================================================================

module "dns" {
  count  = var.enable_custom_domain ? 1 : 0
  source = "./modules/dns"

  dns_zone               = var.dns_zone
  api_domain             = var.api_domain
  app_domain             = var.app_domain
  load_balancer_ip       = module.load_balancer[0].ip_address
  edge_services_endpoint = module.edge[0].endpoint

  depends_on = [module.load_balancer, module.edge]
}

# =============================================================================
# MONITORING - Cockpit Observability
# =============================================================================

module "monitoring" {
  source = "./modules/monitoring"

  name_prefix = local.name_prefix
  tags        = local.tags
}
