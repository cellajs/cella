# DNS Module - Scaleway Domains

variable "dns_zone" {
  type = string
}

variable "api_domain" {
  type = string
}

variable "app_domain" {
  type = string
}

variable "load_balancer_ip" {
  type = string
}

variable "edge_services_endpoint" {
  type = string
}

# -----------------------------------------------------------------------------
# DNS Zone (assumes zone already exists in Scaleway)
# -----------------------------------------------------------------------------

data "scaleway_domain_zone" "main" {
  domain    = var.dns_zone
  subdomain = ""
}

# -----------------------------------------------------------------------------
# API Domain -> Load Balancer
# -----------------------------------------------------------------------------

locals {
  # Extract subdomain from api_domain (e.g., "api" from "api.cellajs.com")
  api_subdomain = replace(var.api_domain, ".${var.dns_zone}", "")
  app_subdomain = replace(var.app_domain, ".${var.dns_zone}", "")
}

resource "scaleway_domain_record" "api" {
  dns_zone = data.scaleway_domain_zone.main.id
  name     = local.api_subdomain
  type     = "A"
  data     = var.load_balancer_ip
  ttl      = 300
}

# -----------------------------------------------------------------------------
# App Domain -> Edge Services (for static frontend)
# Or -> Load Balancer if serving via LB
# -----------------------------------------------------------------------------

resource "scaleway_domain_record" "app" {
  dns_zone = data.scaleway_domain_zone.main.id
  name     = local.app_subdomain == var.dns_zone ? "" : local.app_subdomain
  type     = "CNAME"
  data     = "${var.edge_services_endpoint}."
  ttl      = 300

  # Don't create if it's the apex domain (CNAME not allowed at apex)
  count = local.app_subdomain != "" ? 1 : 0
}

# Apex domain uses ALIAS-like behavior via A record to Edge Services
# Note: Scaleway may require different handling for apex domains
resource "scaleway_domain_record" "app_apex" {
  count    = local.app_subdomain == "" ? 1 : 0
  dns_zone = data.scaleway_domain_zone.main.id
  name     = ""
  type     = "A"
  data     = var.load_balancer_ip # Fallback to LB for apex
  ttl      = 300
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "api_record_id" {
  value = scaleway_domain_record.api.id
}

output "app_record_id" {
  value = length(scaleway_domain_record.app) > 0 ? scaleway_domain_record.app[0].id : scaleway_domain_record.app_apex[0].id
}
