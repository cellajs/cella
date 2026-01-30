# Cella Scaleway Infrastructure Variables

# -----------------------------------------------------------------------------
# Provider Configuration
# -----------------------------------------------------------------------------

variable "region" {
  description = "Scaleway region for resources"
  type        = string
  default     = "nl-ams"
}

variable "zone" {
  description = "Scaleway zone for zonal resources"
  type        = string
  default     = "nl-ams-1"
}

# -----------------------------------------------------------------------------
# Domain Configuration
# -----------------------------------------------------------------------------

variable "dns_zone" {
  description = "DNS zone managed in Scaleway (e.g., cellajs.com)"
  type        = string
}

variable "api_domain" {
  description = "Domain for the API (e.g., api.cellajs.com)"
  type        = string
}

variable "app_domain" {
  description = "Domain for the frontend app (e.g., app.cellajs.com or cellajs.com)"
  type        = string
}

# -----------------------------------------------------------------------------
# Database Configuration
# -----------------------------------------------------------------------------

variable "db_node_type" {
  description = "PostgreSQL instance type"
  type        = string
  default     = "DB-DEV-S" # Smallest for dev, use DB-GP-XS or higher for prod
}

variable "db_volume_size_gb" {
  description = "Database volume size in GB"
  type        = number
  default     = 10
}

# -----------------------------------------------------------------------------
# Container Configuration
# -----------------------------------------------------------------------------

variable "backend_image_tag" {
  description = "Docker image tag for backend container (git SHA)"
  type        = string
}

variable "cdc_image_tag" {
  description = "Docker image tag for CDC worker container (git SHA)"
  type        = string
}

variable "backend_min_scale" {
  description = "Minimum number of backend container instances"
  type        = number
  default     = 0
}

variable "backend_max_scale" {
  description = "Maximum number of backend container instances"
  type        = number
  default     = 10
}

variable "backend_memory" {
  description = "Memory allocation for backend container (MB)"
  type        = number
  default     = 512
}

variable "cdc_memory" {
  description = "Memory allocation for CDC worker container (MB)"
  type        = number
  default     = 256
}

# -----------------------------------------------------------------------------
# Secrets (sensitive - pass via CI/CD or tfvars)
# -----------------------------------------------------------------------------

variable "argon_secret" {
  description = "Secret for Argon2id password hashing"
  type        = string
  sensitive   = true
}

variable "cookie_secret" {
  description = "Secret for cookie signing"
  type        = string
  sensitive   = true
}

variable "unsubscribe_token_secret" {
  description = "Secret for email unsubscribe tokens"
  type        = string
  sensitive   = true
}

variable "cdc_ws_secret" {
  description = "Secret for CDC WebSocket authentication (min 16 chars)"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.cdc_ws_secret) >= 16
    error_message = "CDC WebSocket secret must be at least 16 characters"
  }
}

# -----------------------------------------------------------------------------
# SSL Configuration
# -----------------------------------------------------------------------------

variable "ssl_certificate_id" {
  description = "Scaleway certificate ID for Load Balancer (optional, uses Let's Encrypt if not provided)"
  type        = string
  default     = null
}

# -----------------------------------------------------------------------------
# Feature Flags
# -----------------------------------------------------------------------------

variable "enable_waf" {
  description = "Enable WAF on Edge Services"
  type        = bool
  default     = true
}
