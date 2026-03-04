# =============================================================================
# Cella Scaleway Infrastructure Variables
# =============================================================================

# -----------------------------------------------------------------------------
# Provider Configuration
# -----------------------------------------------------------------------------

variable "scaleway_project_id" {
  description = "Scaleway project ID"
  type        = string
}

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

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
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
  description = "Domain for the frontend app (e.g., app.cellajs.com)"
  type        = string
}

# -----------------------------------------------------------------------------
# Database Configuration (Neon PostgreSQL - external)
# -----------------------------------------------------------------------------

variable "database_url" {
  description = "PostgreSQL pooled connection string for the backend API (Neon pooler URL)"
  type        = string
  sensitive   = true
}

variable "database_url_direct" {
  description = "PostgreSQL direct connection string for CDC worker and migrations (Neon direct URL)"
  type        = string
  sensitive   = true
}

variable "database_url_cdc" {
  description = "PostgreSQL direct connection string for CDC worker (Neon direct URL with cdc_role)"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Container Configuration - Backend
# -----------------------------------------------------------------------------

variable "backend_image_tag" {
  description = "Docker image tag for backend container (e.g., git SHA or 'latest')"
  type        = string
  default     = "latest"
}

variable "backend_min_scale" {
  description = "Minimum number of backend container instances (0 = scale to zero)"
  type        = number
  default     = 0
}

variable "backend_max_scale" {
  description = "Maximum number of backend container instances"
  type        = number
  default     = 10
}

variable "backend_memory" {
  description = "Memory allocation for backend container (MB). Must match Scaleway tier: 128/256/512/1024/2048/3072/4096"
  type        = number
  default     = 1024
}

variable "backend_cpu" {
  description = "CPU allocation for backend container (milli-vCPU). Must match memory tier: 128=70, 256=140, 512=280, 1024=560, 2048=1120"
  type        = number
  default     = 560
}

# -----------------------------------------------------------------------------
# Container Configuration - CDC Worker
# -----------------------------------------------------------------------------

variable "cdc_image_tag" {
  description = "Docker image tag for CDC worker container"
  type        = string
  default     = "latest"
}

variable "cdc_memory" {
  description = "Memory allocation for CDC worker container (MB). Must match Scaleway tier."
  type        = number
  default     = 512
}

variable "cdc_cpu" {
  description = "CPU allocation for CDC worker container (milli-vCPU). Must match memory tier."
  type        = number
  default     = 280
}

# -----------------------------------------------------------------------------
# Secrets (sensitive - pass via environment or tfvars)
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

variable "admin_email" {
  description = "Admin email address for the system administrator account"
  type        = string
}

# -----------------------------------------------------------------------------
# Optional OAuth Providers
# -----------------------------------------------------------------------------

variable "github_client_id" {
  description = "GitHub OAuth client ID"
  type        = string
  default     = ""
}

variable "github_client_secret" {
  description = "GitHub OAuth client secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  default     = ""
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Optional S3 Storage
# -----------------------------------------------------------------------------

variable "s3_access_key_id" {
  description = "S3 access key ID for file uploads"
  type        = string
  default     = ""
}

variable "s3_secret_access_key" {
  description = "S3 secret access key for file uploads"
  type        = string
  default     = ""
  sensitive   = true
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
  description = "Enable WAF on Edge Services (recommended for production)"
  type        = bool
  default     = false
}

variable "enable_custom_domain" {
  description = "Enable custom domain setup (DNS, Edge Services, Load Balancer). Set to false for initial deployment without domain."
  type        = bool
  default     = false
}

variable "bucket_suffix" {
  description = "Suffix to append to bucket names (for recreating locked buckets)"
  type        = string
  default     = ""
}
