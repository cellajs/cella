# Monitoring Module - Scaleway Cockpit

variable "name_prefix" {
  type = string
}

variable "tags" {
  type = list(string)
}

# -----------------------------------------------------------------------------
# Cockpit (Observability)
# -----------------------------------------------------------------------------

# Note: Cockpit is automatically enabled at the project level
# This module configures data sources and dashboards

resource "scaleway_cockpit" "main" {
  # Cockpit is a singleton per project
}

# -----------------------------------------------------------------------------
# Grafana User for Dashboard Access
# -----------------------------------------------------------------------------

resource "scaleway_cockpit_grafana_user" "admin" {
  login = "${var.name_prefix}-admin"
  role  = "editor"
}

# -----------------------------------------------------------------------------
# Alert Manager (optional)
# -----------------------------------------------------------------------------

resource "scaleway_cockpit_alert_manager" "main" {
  enable_managed_alerts = true

  contact_points {
    email {
      to = "alerts@cellajs.com" # Configure via variable in production
    }
  }
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
