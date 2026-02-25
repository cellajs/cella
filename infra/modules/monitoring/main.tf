# =============================================================================
# Monitoring Module - Scaleway Cockpit Observability
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

variable "tags" {
  type = list(string)
}

# -----------------------------------------------------------------------------
# Cockpit (Observability Platform)
# Note: Cockpit is automatically enabled at the project level
# -----------------------------------------------------------------------------

resource "scaleway_cockpit" "main" {
  # Cockpit is a singleton per project, no additional config needed
}

# -----------------------------------------------------------------------------
# Grafana User for Dashboard Access
# -----------------------------------------------------------------------------

resource "scaleway_cockpit_grafana_user" "admin" {
  login = "${var.name_prefix}-admin"
  role  = "editor"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "cockpit_id" {
  value = scaleway_cockpit.main.id
}

output "grafana_user" {
  value = scaleway_cockpit_grafana_user.admin.login
}

output "endpoints" {
  value = {
    grafana = scaleway_cockpit.main.endpoints[0].grafana_url
    logs    = scaleway_cockpit.main.endpoints[0].logs_url
    metrics = scaleway_cockpit.main.endpoints[0].metrics_url
  }
}
