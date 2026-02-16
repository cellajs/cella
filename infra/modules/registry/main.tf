# Container Registry Module

variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

# -----------------------------------------------------------------------------
# Container Registry Namespace
# -----------------------------------------------------------------------------

resource "scaleway_registry_namespace" "main" {
  name        = replace(var.name_prefix, "-", "") # Registry names can't have hyphens
  region      = var.region
  description = "Container images for ${var.name_prefix}"
  is_public   = false
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "id" {
  value = scaleway_registry_namespace.main.id
}

output "endpoint" {
  value = scaleway_registry_namespace.main.endpoint
}

output "namespace" {
  value = scaleway_registry_namespace.main.name
}
