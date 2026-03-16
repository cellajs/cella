# Minimal Cella Container Deployment
# Deploys only Backend API + CDC Worker containers to Scaleway
# Usage: terraform apply -var-file="dev.tfvars"

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.40"
    }
  }
}

provider "scaleway" {
  region = var.region
  zone   = var.zone
}

locals {
  env         = var.environment
  name_prefix = "${local.env}-cella"

  tags = [
    "env:${local.env}",
    "app:cella",
    "managed-by:terraform"
  ]
}

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "Scaleway region"
  type        = string
  default     = "nl-ams"
}

variable "zone" {
  description = "Scaleway zone"
  type        = string
  default     = "nl-ams-1"
}

variable "backend_image_tag" {
  type    = string
  default = "latest"
}

variable "cdc_image_tag" {
  type    = string
  default = "latest"
}

variable "backend_min_scale" {
  type    = number
  default = 0
}

variable "backend_max_scale" {
  type    = number
  default = 3
}

variable "backend_memory" {
  type    = number
  default = 1024
}

variable "cdc_memory" {
  type    = number
  default = 512
}

# Domain
variable "api_domain" {
  type    = string
  default = "api.dev.cellajs.com"
}

variable "app_domain" {
  type    = string
  default = "dev.cellajs.com"
}

# Database URLs
variable "database_url" {
  type      = string
  sensitive = true
}

variable "database_admin_url" {
  type      = string
  sensitive = true
}

variable "database_cdc_url" {
  type      = string
  sensitive = true
}

# Secrets
variable "argon_secret" {
  type      = string
  sensitive = true
}

variable "cookie_secret" {
  type      = string
  sensitive = true
}

variable "unsubscribe_secret" {
  type      = string
  sensitive = true
}

variable "cdc_internal_secret" {
  type      = string
  sensitive = true
}

variable "session_secret" {
  type      = string
  default   = ""
  sensitive = true
}

# App config
variable "admin_email" {
  type = string
}

variable "system_admin_ip_allowlist" {
  type    = string
  default = "*"
}

# Third-party
variable "brevo_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "github_client_id" {
  type    = string
  default = ""
}

variable "github_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "s3_access_key_id" {
  type    = string
  default = ""
}

variable "s3_access_key_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "transloadit_key" {
  type    = string
  default = ""
}

variable "transloadit_secret" {
  type      = string
  default   = ""
  sensitive = true
}

# -----------------------------------------------------------------------------
# Container Registry
# -----------------------------------------------------------------------------

resource "scaleway_registry_namespace" "main" {
  name        = "devcella"
  region      = var.region
  description = "Container images for ${local.name_prefix}"
  is_public   = false
}

# -----------------------------------------------------------------------------
# Container Namespace
# -----------------------------------------------------------------------------

resource "scaleway_container_namespace" "main" {
  name        = "${local.name_prefix}-containers"
  region      = var.region
  description = "Serverless containers for ${local.name_prefix}"
}

# -----------------------------------------------------------------------------
# Backend API Container
# -----------------------------------------------------------------------------

resource "scaleway_container" "backend" {
  name           = "${local.name_prefix}-backend"
  namespace_id   = scaleway_container_namespace.main.id
  region         = var.region
  registry_image = "${scaleway_registry_namespace.main.endpoint}/backend:${var.backend_image_tag}"
  port           = 4000
  cpu_limit      = 1000
  memory_limit   = var.backend_memory
  min_scale      = var.backend_min_scale
  max_scale      = var.backend_max_scale
  timeout        = 300
  privacy        = "public"
  protocol       = "http1"
  http_option    = "redirected"
  deploy         = true

  environment_variables = {
    # IMPORTANT: Always use "production" for deployed containers because:
    # 1. Docker images are built with `pnpm install --prod` (no dev dependencies like pino-pretty)
    # 2. appConfig uses NODE_ENV to select URLs/config - "development" uses localhost URLs
    # 3. CDC worker exits unless DEV_MODE=full OR NODE_ENV=production
    # NOTE: Do NOT set PORT - it is reserved by Scaleway and set automatically
    NODE_ENV                  = "production"
    TZ                        = "UTC"
    FRONTEND_URL              = "https://${var.app_domain}"
    BACKEND_URL               = "https://${var.api_domain}"
    DEV_MODE                  = "core"
    ADMIN_EMAIL               = var.admin_email
    SYSTEM_ADMIN_IP_ALLOWLIST = var.system_admin_ip_allowlist
  }

  # Secrets are encrypted at rest by Scaleway and hidden from API responses / console
  secret_environment_variables = {
    DATABASE_URL         = var.database_url
    DATABASE_ADMIN_URL   = var.database_admin_url
    ARGON_SECRET         = var.argon_secret
    COOKIE_SECRET        = var.cookie_secret
    SESSION_SECRET       = var.session_secret
    UNSUBSCRIBE_SECRET   = var.unsubscribe_secret
    CDC_INTERNAL_SECRET  = var.cdc_internal_secret
    BREVO_API_KEY        = var.brevo_api_key
    GITHUB_CLIENT_ID     = var.github_client_id
    GITHUB_CLIENT_SECRET = var.github_client_secret
    S3_ACCESS_KEY_ID     = var.s3_access_key_id
    S3_ACCESS_KEY_SECRET = var.s3_access_key_secret
    TRANSLOADIT_KEY      = var.transloadit_key
    TRANSLOADIT_SECRET   = var.transloadit_secret
  }

  # HTTP health check on /health endpoint
  # The backend responds 200 (healthy) or 503 (unhealthy)
  health_check {
    http {
      path = "/health"
    }
    interval          = "10s"
    failure_threshold = 30
  }
}

# -----------------------------------------------------------------------------
# CDC Worker Container
# -----------------------------------------------------------------------------

resource "scaleway_container" "cdc" {
  name           = "${local.name_prefix}-cdc"
  namespace_id   = scaleway_container_namespace.main.id
  region         = var.region
  registry_image = "${scaleway_registry_namespace.main.endpoint}/cdc:${var.cdc_image_tag}"
  port           = 4001
  cpu_limit      = 500
  memory_limit   = var.cdc_memory
  min_scale      = 1
  max_scale      = 1
  timeout        = 900
  privacy        = "private"
  protocol       = "http1"
  deploy         = true

  environment_variables = {
    # IMPORTANT: Must be "production" - CDC exits immediately unless DEV_MODE=full or NODE_ENV=production
    # NOTE: Do NOT set PORT - it is reserved by Scaleway and set automatically
    NODE_ENV        = "production"
    TZ              = "UTC"
    DEV_MODE        = "full"
    CDC_HEALTH_PORT = "4001"
    API_WS_URL      = "wss://${var.api_domain}/internal/cdc"
  }

  # Secrets are encrypted at rest by Scaleway and hidden from API responses / console
  secret_environment_variables = {
    DATABASE_CDC_URL    = var.database_cdc_url
    CDC_INTERNAL_SECRET = var.cdc_internal_secret
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "registry_endpoint" {
  value = scaleway_registry_namespace.main.endpoint
}

output "backend_endpoint" {
  value       = scaleway_container.backend.domain_name
  description = "Backend container public endpoint"
}

output "backend_url" {
  value = "https://${scaleway_container.backend.domain_name}"
}

output "cdc_endpoint" {
  value       = scaleway_container.cdc.domain_name
  description = "CDC container endpoint"
}

output "namespace_id" {
  value = scaleway_container_namespace.main.id
}