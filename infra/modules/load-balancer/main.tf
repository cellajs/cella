terraform {
  required_providers {
    scaleway = {
      source = "scaleway/scaleway"
    }
  }
}

# Load Balancer Module - Production routing layer

variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "zone" {
  type = string
}

variable "private_network_id" {
  type = string
}

variable "backend_container_endpoint" {
  type = string
}

variable "cdc_container_endpoint" {
  type = string
}

variable "frontend_bucket_endpoint" {
  type = string
}

variable "api_domain" {
  type = string
}

variable "app_domain" {
  type = string
}

variable "ssl_certificate_id" {
  type    = string
  default = null
}

variable "tags" {
  type = list(string)
}

# -----------------------------------------------------------------------------
# Load Balancer Instance
# -----------------------------------------------------------------------------

resource "scaleway_lb" "main" {
  name               = "${var.name_prefix}-lb"
  type               = "LB-S" # Smallest for dev, LB-GP-S or higher for prod
  zone               = var.zone
  assign_flexible_ip = true
  tags               = var.tags
}

# Attach to private network
resource "scaleway_lb_private_network" "main" {
  lb_id              = scaleway_lb.main.id
  private_network_id = var.private_network_id
  zone               = var.zone
}

# -----------------------------------------------------------------------------
# SSL Certificate (Let's Encrypt)
# -----------------------------------------------------------------------------

resource "scaleway_lb_certificate" "main" {
  count = var.ssl_certificate_id == null ? 1 : 0
  lb_id = scaleway_lb.main.id
  name  = "${var.name_prefix}-cert"

  letsencrypt {
    common_name              = var.api_domain
    subject_alternative_name = [var.app_domain]
  }
}

locals {
  certificate_id = var.ssl_certificate_id != null ? var.ssl_certificate_id : scaleway_lb_certificate.main[0].id
}

# -----------------------------------------------------------------------------
# Backend: API Container
# -----------------------------------------------------------------------------

resource "scaleway_lb_backend" "api" {
  lb_id            = scaleway_lb.main.id
  name             = "${var.name_prefix}-api-backend"
  forward_protocol = "http"
  forward_port     = 443
  proxy_protocol   = "none"

  # Target the Serverless Container endpoint
  server_ips = [] # Will use forward_port_algorithm with external target

  health_check_http {
    uri    = "/health"
    method = "GET"
    code   = 200
  }

  health_check_timeout     = "5s"
  health_check_delay       = "10s"
  health_check_max_retries = 3

  # Timeouts
  timeout_server  = "30s"
  timeout_connect = "5s"
  timeout_tunnel  = "15m" # WebSocket support for CDC

  # Sticky sessions disabled - stateless API
  sticky_sessions = "none"
}

# -----------------------------------------------------------------------------
# Backend: CDC Worker (health/metrics only)
# -----------------------------------------------------------------------------

resource "scaleway_lb_backend" "cdc" {
  lb_id            = scaleway_lb.main.id
  name             = "${var.name_prefix}-cdc-backend"
  forward_protocol = "http"
  forward_port     = 443
  proxy_protocol   = "none"

  server_ips = []

  health_check_http {
    uri    = "/health"
    method = "GET"
    code   = 200
  }

  health_check_timeout     = "5s"
  health_check_delay       = "30s"
  health_check_max_retries = 3

  timeout_server  = "10s"
  timeout_connect = "5s"

  sticky_sessions = "none"
}

# -----------------------------------------------------------------------------
# Frontend: HTTPS (port 443)
# -----------------------------------------------------------------------------

resource "scaleway_lb_frontend" "https" {
  lb_id          = scaleway_lb.main.id
  name           = "${var.name_prefix}-https"
  inbound_port   = 443
  backend_id     = scaleway_lb_backend.api.id # Default to API
  timeout_client = "30s"

  certificate_ids = var.ssl_certificate_id != null ? [var.ssl_certificate_id] : [scaleway_lb_certificate.main[0].id]
}

# -----------------------------------------------------------------------------
# Routes: Path-based routing
# -----------------------------------------------------------------------------

# Route /api/* to Backend API
resource "scaleway_lb_route" "api" {
  frontend_id       = scaleway_lb_frontend.https.id
  backend_id        = scaleway_lb_backend.api.id
  match_host_header = var.api_domain
}

# Route /cdc/* to CDC Worker
resource "scaleway_lb_route" "cdc" {
  frontend_id       = scaleway_lb_frontend.https.id
  backend_id        = scaleway_lb_backend.cdc.id
  match_host_header = var.api_domain
  # Note: Scaleway routes match on host header, URL path routing 
  # is handled via separate subdomains or ACL rules
}

# -----------------------------------------------------------------------------
# Frontend: HTTP redirect to HTTPS
# -----------------------------------------------------------------------------

resource "scaleway_lb_frontend" "http_redirect" {
  lb_id          = scaleway_lb.main.id
  name           = "${var.name_prefix}-http-redirect"
  inbound_port   = 80
  backend_id     = scaleway_lb_backend.api.id # Placeholder, will redirect
  timeout_client = "5s"
}

# ACL to redirect HTTP to HTTPS
resource "scaleway_lb_acl" "http_redirect" {
  frontend_id = scaleway_lb_frontend.http_redirect.id
  name        = "redirect-to-https"
  index       = 1

  action {
    type = "redirect"
    redirect {
      type   = "scheme"
      target = "https"
      code   = 301
    }
  }

  match {
    ip_subnet = ["0.0.0.0/0"] # Match all
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "id" {
  value = scaleway_lb.main.id
}

output "ip_address" {
  value = scaleway_lb.main.ip_address
}

output "frontend_id" {
  value = scaleway_lb_frontend.https.id
}

output "api_backend_id" {
  value = scaleway_lb_backend.api.id
}

output "cdc_backend_id" {
  value = scaleway_lb_backend.cdc.id
}
