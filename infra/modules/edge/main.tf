# Edge Services Module - CDN + WAF for frontend

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
  default = true
}

# -----------------------------------------------------------------------------
# Edge Services Pipeline
# -----------------------------------------------------------------------------

resource "scaleway_edge_services_pipeline" "frontend" {
  name        = "${var.name_prefix}-frontend-cdn"
  description = "CDN and WAF for frontend static files"
}

# -----------------------------------------------------------------------------
# Backend Stage (Object Storage)
# -----------------------------------------------------------------------------

resource "scaleway_edge_services_backend_stage" "frontend" {
  pipeline_id = scaleway_edge_services_pipeline.frontend.id

  s3_backend_config {
    bucket_name   = split("/", var.frontend_bucket_id)[1] # Extract bucket name
    bucket_region = var.region
  }
}

# -----------------------------------------------------------------------------
# Cache Stage
# -----------------------------------------------------------------------------

resource "scaleway_edge_services_cache_stage" "frontend" {
  pipeline_id      = scaleway_edge_services_pipeline.frontend.id
  backend_stage_id = scaleway_edge_services_backend_stage.frontend.id

  # Default fallback TTL if no Cache-Control header
  fallback_ttl = "1h"
}

# -----------------------------------------------------------------------------
# WAF Stage (optional)
# -----------------------------------------------------------------------------

resource "scaleway_edge_services_waf_stage" "frontend" {
  count       = var.enable_waf ? 1 : 0
  pipeline_id = scaleway_edge_services_pipeline.frontend.id

  # OWASP Core Rule Set
  waf_config {
    paranoia_level = 1 # 1-4, higher = more strict
  }
}

# -----------------------------------------------------------------------------
# DNS Stage (Custom Domain)
# -----------------------------------------------------------------------------

resource "scaleway_edge_services_dns_stage" "frontend" {
  pipeline_id    = scaleway_edge_services_pipeline.frontend.id
  cache_stage_id = scaleway_edge_services_cache_stage.frontend.id

  fqdns = [var.app_domain]

  # Let's Encrypt certificate
  tls_stage {
    managed_certificate = true
  }
}

# -----------------------------------------------------------------------------
# Purge Rule (for deployments)
# -----------------------------------------------------------------------------

resource "scaleway_edge_services_purge_request" "index" {
  pipeline_id = scaleway_edge_services_pipeline.frontend.id

  # This resource is for reference - actual purge is done via API during deploy
  # Purge only index.html on deploy, not all assets
  assets = ["index.html"]

  # Lifecycle to prevent re-purging on every apply
  lifecycle {
    ignore_changes = [assets]
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "pipeline_id" {
  value = scaleway_edge_services_pipeline.frontend.id
}

output "endpoint" {
  value = scaleway_edge_services_dns_stage.frontend.fqdns[0]
}

output "cache_stage_id" {
  value = scaleway_edge_services_cache_stage.frontend.id
}
