# Cella Scaleway Infrastructure Outputs

output "environment" {
  description = "Current deployment environment"
  value       = local.env
}

# -----------------------------------------------------------------------------
# URLs
# -----------------------------------------------------------------------------

output "frontend_url" {
  description = "Frontend application URL"
  value       = "https://${var.app_domain}"
}

output "backend_url" {
  description = "Backend API URL"
  value       = "https://${var.api_domain}"
}

output "api_health_url" {
  description = "Backend health check URL"
  value       = "https://${var.api_domain}/api/ping"
}

# -----------------------------------------------------------------------------
# Container Registry
# -----------------------------------------------------------------------------

output "registry_endpoint" {
  description = "Container registry endpoint for pushing images"
  value       = module.registry.endpoint
}

output "backend_image" {
  description = "Full backend image path"
  value       = "${module.registry.endpoint}/backend:${var.backend_image_tag}"
}

output "cdc_image" {
  description = "Full CDC worker image path"
  value       = "${module.registry.endpoint}/cdc:${var.cdc_image_tag}"
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

output "database_host" {
  description = "PostgreSQL host (for debugging, use secrets in production)"
  value       = module.database.host
  sensitive   = true
}

output "database_port" {
  description = "PostgreSQL port"
  value       = module.database.port
}

output "database_pooler_port" {
  description = "PostgreSQL connection pooler port"
  value       = module.database.pooler_port
}

# -----------------------------------------------------------------------------
# Load Balancer
# -----------------------------------------------------------------------------

output "load_balancer_ip" {
  description = "Load Balancer public IP address"
  value       = module.load_balancer.ip_address
}

output "load_balancer_id" {
  description = "Load Balancer ID"
  value       = module.load_balancer.id
}

# -----------------------------------------------------------------------------
# Storage
# -----------------------------------------------------------------------------

output "frontend_bucket_name" {
  description = "Frontend static files bucket name"
  value       = module.storage.frontend_bucket_name
}

output "frontend_bucket_endpoint" {
  description = "Frontend bucket website endpoint"
  value       = module.storage.frontend_bucket_website_endpoint
}

output "public_uploads_bucket_name" {
  description = "Public uploads bucket name"
  value       = module.storage.public_uploads_bucket_name
}

output "private_uploads_bucket_name" {
  description = "Private uploads bucket name"
  value       = module.storage.private_uploads_bucket_name
}

# -----------------------------------------------------------------------------
# Edge Services
# -----------------------------------------------------------------------------

output "edge_endpoint" {
  description = "Edge Services endpoint"
  value       = module.edge.endpoint
}

# -----------------------------------------------------------------------------
# Monitoring
# -----------------------------------------------------------------------------

output "cockpit_endpoints" {
  description = "Cockpit monitoring endpoints"
  value       = module.monitoring.endpoints
}
