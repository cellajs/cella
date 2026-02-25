# =============================================================================
# Edge Services Module - CDN + WAF for Frontend
# =============================================================================

terraform {
  required_providers {
    scaleway = {
      source = "scaleway/scaleway"
    }
  }
}

variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "frontend_bucket_id" {
  type = string
}

variable "app_domain" {
  type = string
}

variable "enable_waf" {
  type    = bool
  default = false
}

# -----------------------------------------------------------------------------
# Edge Services Pipeline
# -----------------------------------------------------------------------------

resource "scaleway_edge_services_pipeline" "frontend" {
  name        = "${var.name_prefix}-frontend-cdn"
  description = "CDN and WAF for frontend static files"
}

# -----------------------------------------------------------------------------
# Backend Stage (Object Storage origin)
# -----------------------------------------------------------------------------

resource "scaleway_edge_services_backend_stage" "frontend" {
  pipeline_id = scaleway_edge_services_pipeline.frontend.id

  s3_backend_config {
    bucket_name   = split("/", var.frontend_bucket_id)[1]
    bucket_region = var.region
  }
}

# -----------------------------------------------------------------------------
# Cache Stage
# -----------------------------------------------------------------------------

resource "scaleway_edge_services_cache_stage" "frontend" {
  pipeline_id      = scaleway_edge_services_pipeline.frontend.id
  backend_stage_id = scaleway_edge_services_backend_stage.frontend.id
  fallback_ttl     = 3600 # 1 hour in seconds
}

# -----------------------------------------------------------------------------
# WAF Stage (optional - production only)
# -----------------------------------------------------------------------------

resource "scaleway_edge_services_waf_stage" "frontend" {
  count          = var.enable_waf ? 1 : 0
  pipeline_id    = scaleway_edge_services_pipeline.frontend.id
  paranoia_level = 1 # 1-4, higher = more strict
}

# -----------------------------------------------------------------------------
# DNS Stage (Custom Domain with TLS)
# -----------------------------------------------------------------------------

resource "scaleway_edge_services_dns_stage" "frontend" {
  pipeline_id    = scaleway_edge_services_pipeline.frontend.id
  cache_stage_id = scaleway_edge_services_cache_stage.frontend.id
  fqdns          = [var.app_domain]

  tls_stage_id = scaleway_edge_services_tls_stage.frontend.id
}

# TLS Stage for managed certificates
resource "scaleway_edge_services_tls_stage" "frontend" {
  pipeline_id         = scaleway_edge_services_pipeline.frontend.id
  managed_certificate = true
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "pipeline_id" {
  value = scaleway_edge_services_pipeline.frontend.id
}

output "endpoint" {
  value = var.app_domain
}

output "cache_stage_id" {
  value = scaleway_edge_services_cache_stage.frontend.id
}
