terraform {
  required_providers {
    scaleway = {
      source = "scaleway/scaleway"
    }
  }
}

# Serverless Containers Module - Backend API + CDC Worker

variable "name_prefix" {
  type = string
}

variable "env" {
  type = string
}

variable "region" {
  type = string
}

variable "registry_endpoint" {
  type = string
}

variable "private_network_id" {
  type = string
}

variable "backend_image_tag" {
  type = string
}

variable "cdc_image_tag" {
  type = string
}

variable "secret_ids" {
  type = map(string)
}

variable "backend_min_scale" {
  type    = number
  default = 0
}

variable "backend_max_scale" {
  type    = number
  default = 10
}

variable "backend_memory" {
  type    = number
  default = 1024 # Scaleway requires min 1000 MB for 1000 mvCPU
}

variable "cdc_memory" {
  type    = number
  default = 512 # Scaleway requires min 500 MB for 500 mvCPU
}

variable "backend_cpu" {
  type    = number
  default = 1000 # 1 vCPU in mvCPU
}

variable "cdc_cpu" {
  type    = number
  default = 500 # 0.5 vCPU in mvCPU
}

variable "frontend_url" {
  type = string
}

variable "backend_url" {
  type = string
}

variable "tags" {
  type = list(string)
}

# -----------------------------------------------------------------------------
# Container Namespace
# -----------------------------------------------------------------------------

resource "scaleway_container_namespace" "main" {
  name        = "${var.name_prefix}-containers"
  region      = var.region
  description = "Serverless containers for ${var.name_prefix}"
}

# -----------------------------------------------------------------------------
# Backend API Container
# -----------------------------------------------------------------------------

resource "scaleway_container" "backend" {
  name            = "${var.name_prefix}-backend"
  namespace_id    = scaleway_container_namespace.main.id
  region          = var.region
  registry_image  = "${var.registry_endpoint}/backend:${var.backend_image_tag}"
  port            = 4000
  cpu_limit       = var.backend_cpu
  memory_limit    = var.backend_memory
  min_scale       = var.backend_min_scale
  max_scale       = var.backend_max_scale
  timeout         = 300 # 5 minutes
  max_concurrency = 80
  privacy         = "private" # Only accessible via Load Balancer
  protocol        = "http1"
  http_option     = "redirected" # Redirect HTTP to HTTPS
  deploy          = true

  environment_variables = {
    NODE_ENV     = var.env == "prod" ? "production" : var.env
    TZ           = "UTC"
    FRONTEND_URL = var.frontend_url
    BACKEND_URL  = var.backend_url
    DEV_MODE     = "core" # core mode for serverless (no local CDC)
  }

  # Reference secrets from Secret Manager
  secret_environment_variables = {
    DATABASE_URL             = var.secret_ids.database_url_pooled
    ARGON_SECRET             = var.secret_ids.argon_secret
    COOKIE_SECRET            = var.secret_ids.cookie_secret
    UNSUBSCRIBE_TOKEN_SECRET = var.secret_ids.unsubscribe_token_secret
    CDC_WS_SECRET            = var.secret_ids.cdc_ws_secret
  }
}

# -----------------------------------------------------------------------------
# CDC Worker Container
# -----------------------------------------------------------------------------

resource "scaleway_container" "cdc" {
  name            = "${var.name_prefix}-cdc"
  namespace_id    = scaleway_container_namespace.main.id
  region          = var.region
  registry_image  = "${var.registry_endpoint}/cdc:${var.cdc_image_tag}"
  port            = 4001
  cpu_limit       = var.cdc_cpu
  memory_limit    = var.cdc_memory
  min_scale       = 1   # Always on - required for logical replication slot
  max_scale       = 1   # Only one instance for replication slot
  timeout         = 900 # 15 minutes (long-running)
  max_concurrency = 1   # Single connection to replication slot
  privacy         = "private"
  protocol        = "http1"
  deploy          = true

  environment_variables = {
    NODE_ENV        = var.env == "prod" ? "production" : var.env
    TZ              = "UTC"
    CDC_HEALTH_PORT = "4001"
    # Backend WebSocket URL for CDC to connect to
    CDC_BACKEND_WS_URL = "wss://${replace(var.backend_url, "https://", "")}/cdc"
  }

  # Reference secrets from Secret Manager
  # CDC uses direct database URL (not pooled) for logical replication
  secret_environment_variables = {
    DATABASE_URL  = var.secret_ids.database_url_direct
    CDC_WS_SECRET = var.secret_ids.cdc_ws_secret
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "backend_endpoint" {
  value = scaleway_container.backend.domain_name
}

output "backend_id" {
  value = scaleway_container.backend.id
}

output "cdc_endpoint" {
  value = scaleway_container.cdc.domain_name
}

output "cdc_id" {
  value = scaleway_container.cdc.id
}

output "namespace_id" {
  value = scaleway_container_namespace.main.id
}
