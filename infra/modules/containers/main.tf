# Serverless Containers Module - Backend API + CDC Worker + Yjs Relay

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

variable "yjs_image_tag" {
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
  default = 512
}

variable "cdc_memory" {
  type    = number
  default = 256
}

variable "yjs_memory" {
  type    = number
  default = 256
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
  cpu_limit       = 1000 # 1 vCPU
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
    NODE_ENV          = var.env == "prod" ? "production" : var.env
    TZ                = "UTC"
    FRONTEND_URL      = var.frontend_url
    BACKEND_URL       = var.backend_url
    DEV_MODE          = "core" # core mode for serverless (no local CDC)
  }

  # Reference secrets from Secret Manager
  secret_environment_variables = {
    DATABASE_URL             = var.secret_ids.database_url_pooled
    DATABASE_ADMIN_URL       = var.secret_ids.database_url_admin
    ARGON_SECRET             = var.secret_ids.argon_secret
    COOKIE_SECRET            = var.secret_ids.cookie_secret
    UNSUBSCRIBE_SECRET = var.secret_ids.unsubscribe_secret
    CDC_SECRET               = var.secret_ids.cdc_secret
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
  cpu_limit       = 500 # 0.5 vCPU
  memory_limit    = var.cdc_memory
  min_scale       = 1   # Always on - required for logical replication slot
  max_scale       = 1   # Only one instance for replication slot
  timeout         = 900 # 15 minutes (long-running)
  max_concurrency = 1   # Single connection to replication slot
  privacy         = "private"
  protocol        = "http1"
  deploy          = true

  environment_variables = {
    NODE_ENV       = var.env == "prod" ? "production" : var.env
    TZ             = "UTC"
    # Backend WebSocket URL for CDC to connect to
    API_WS_URL = "wss://${replace(var.backend_url, "https://", "")}/internal/cdc"
  }

  # Reference secrets from Secret Manager
  # CDC uses direct database URL (not pooled) for logical replication
  secret_environment_variables = {
    DATABASE_CDC_URL = var.secret_ids.database_url_direct
    CDC_SECRET       = var.secret_ids.cdc_secret
  }
}

# -----------------------------------------------------------------------------
# Yjs Relay Container
# -----------------------------------------------------------------------------

resource "scaleway_container" "yjs" {
  name            = "${var.name_prefix}-yjs"
  namespace_id    = scaleway_container_namespace.main.id
  region          = var.region
  registry_image  = "${var.registry_endpoint}/yjs:${var.yjs_image_tag}"
  port            = 4002
  cpu_limit       = 500 # 0.5 vCPU
  memory_limit    = var.yjs_memory
  min_scale       = 1   # Always on - WebSocket connections need persistence
  max_scale       = 3
  timeout         = 900 # 15 minutes (long-running WebSocket connections)
  max_concurrency = 50
  privacy         = "private"
  protocol        = "http1"
  deploy          = true

  environment_variables = {
    NODE_ENV = var.env == "prod" ? "production" : var.env
    TZ       = "UTC"
  }

  # Reference secrets from Secret Manager
  # Yjs uses direct database URL for document storage
  secret_environment_variables = {
    DATABASE_URL = var.secret_ids.database_url_direct
    YJS_SECRET   = var.secret_ids.yjs_secret
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

output "yjs_endpoint" {
  value = scaleway_container.yjs.domain_name
}

output "yjs_id" {
  value = scaleway_container.yjs.id
}

output "namespace_id" {
  value = scaleway_container_namespace.main.id
}
