# Cella Scaleway Infrastructure
#
# Single project deployment with environment-prefixed resources.
# Usage:
#   terraform init
#   terraform workspace new dev (or staging, prod)
#   terraform apply -var-file="environments/dev.tfvars"

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.40"
    }
  }

  # Remote state in Scaleway Object Storage
  # Configure via environment variables or backend config file
  backend "s3" {
    # Set via -backend-config or environment:
    # bucket         = "cella-terraform-state"
    # key            = "terraform.tfstate"
    # region         = "nl-ams"
    # endpoint       = "s3.nl-ams.scw.cloud"
    # skip_credentials_validation = true
    # skip_region_validation      = true
    # skip_metadata_api_check     = true
  }
}

provider "scaleway" {
  region = var.region
  zone   = var.zone
}

# Current workspace as environment identifier
locals {
  env = terraform.workspace

  # Resource naming convention: {env}-cella-{resource}
  name_prefix = "${local.env}-cella"

  # Common tags for all resources
  tags = [
    "env:${local.env}",
    "app:cella",
    "managed-by:terraform"
  ]
}

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------

module "network" {
  source = "./modules/network"

  name_prefix = local.name_prefix
  region      = var.region
  tags        = local.tags
}

# -----------------------------------------------------------------------------
# Database (PostgreSQL with logical replication)
# -----------------------------------------------------------------------------

module "database" {
  source = "./modules/database"

  name_prefix       = local.name_prefix
  region            = var.region
  node_type         = var.db_node_type
  volume_size_gb    = var.db_volume_size_gb
  private_network_id = module.network.private_network_id
  tags              = local.tags
}

# -----------------------------------------------------------------------------
# Container Registry
# -----------------------------------------------------------------------------

module "registry" {
  source = "./modules/registry"

  name_prefix = local.name_prefix
  region      = var.region
}

# -----------------------------------------------------------------------------
# Secrets Manager
# -----------------------------------------------------------------------------

module "secrets" {
  source = "./modules/secrets"

  name_prefix = local.name_prefix
  env         = local.env
  region      = var.region

  # Database URLs from database module
  database_url_direct = module.database.connection_string_direct
  database_url_pooled = module.database.connection_string_pooled

  # Application secrets (passed via tfvars or CI/CD)
  argon_secret              = var.argon_secret
  cookie_secret             = var.cookie_secret
  unsubscribe_token_secret  = var.unsubscribe_token_secret
  cdc_ws_secret             = var.cdc_ws_secret

  tags = local.tags
}

# -----------------------------------------------------------------------------
# Serverless Containers (Backend API + CDC Worker)
# -----------------------------------------------------------------------------

module "containers" {
  source = "./modules/containers"

  name_prefix        = local.name_prefix
  env                = local.env
  region             = var.region
  registry_endpoint  = module.registry.endpoint
  private_network_id = module.network.private_network_id

  # Image tags (passed from CI/CD)
  backend_image_tag = var.backend_image_tag
  cdc_image_tag     = var.cdc_image_tag

  # Secret references
  secret_ids = module.secrets.secret_ids

  # Container configuration
  backend_min_scale = var.backend_min_scale
  backend_max_scale = var.backend_max_scale
  backend_memory    = var.backend_memory
  cdc_memory        = var.cdc_memory

  # URLs for container environment
  frontend_url = "https://${var.app_domain}"
  backend_url  = "https://${var.api_domain}"

  tags = local.tags
}

# -----------------------------------------------------------------------------
# Object Storage (Frontend static files)
# -----------------------------------------------------------------------------

module "storage" {
  source = "./modules/storage"

  name_prefix = local.name_prefix
  region      = var.region
  tags        = local.tags
}

# -----------------------------------------------------------------------------
# Load Balancer (Production routing)
# -----------------------------------------------------------------------------

module "load_balancer" {
  source = "./modules/load-balancer"

  name_prefix        = local.name_prefix
  region             = var.region
  zone               = var.zone
  private_network_id = module.network.private_network_id

  # Backend targets
  backend_container_endpoint = module.containers.backend_endpoint
  cdc_container_endpoint     = module.containers.cdc_endpoint
  frontend_bucket_endpoint   = module.storage.frontend_bucket_website_endpoint

  # Domain configuration
  api_domain = var.api_domain
  app_domain = var.app_domain

  # SSL configuration
  ssl_certificate_id = var.ssl_certificate_id

  tags = local.tags
}

# -----------------------------------------------------------------------------
# Edge Services (CDN + WAF for frontend)
# -----------------------------------------------------------------------------

module "edge" {
  source = "./modules/edge"

  name_prefix              = local.name_prefix
  region                   = var.region
  frontend_bucket_id       = module.storage.frontend_bucket_id
  app_domain               = var.app_domain
  enable_waf               = var.enable_waf
}

# -----------------------------------------------------------------------------
# DNS Records
# -----------------------------------------------------------------------------

module "dns" {
  source = "./modules/dns"

  dns_zone               = var.dns_zone
  api_domain             = var.api_domain
  app_domain             = var.app_domain
  load_balancer_ip       = module.load_balancer.ip_address
  edge_services_endpoint = module.edge.endpoint
}

# -----------------------------------------------------------------------------
# Monitoring (Cockpit)
# -----------------------------------------------------------------------------

module "monitoring" {
  source = "./modules/monitoring"

  name_prefix = local.name_prefix
  tags        = local.tags
}
