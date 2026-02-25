# =============================================================================
# Cella Scaleway Infrastructure Outputs
# =============================================================================

# -----------------------------------------------------------------------------
# URLs and Endpoints
# -----------------------------------------------------------------------------

output "app_url" {
  description = "Frontend application URL"
  value       = var.enable_custom_domain ? "https://${var.app_domain}" : module.storage.frontend_bucket_website_endpoint
}

output "api_url" {
  description = "Backend API URL"
  value       = var.enable_custom_domain ? "https://${var.api_domain}" : "https://${module.containers.backend_endpoint}"
}

output "backend_container_endpoint" {
  description = "Backend container endpoint (direct Scaleway URL)"
  value       = module.containers.backend_endpoint
}

output "cdc_container_endpoint" {
  description = "CDC worker container endpoint (direct Scaleway URL)"
  value       = module.containers.cdc_endpoint
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

output "database_host" {
  description = "PostgreSQL host"
  value       = module.database.host
  sensitive   = true
}

output "database_port" {
  description = "PostgreSQL port"
  value       = module.database.port
}

output "database_name" {
  description = "PostgreSQL database name"
  value       = module.database.database_name
}

output "database_connection_string_direct" {
  description = "PostgreSQL direct connection string (for CDC/migrations)"
  value       = module.database.connection_string_direct
  sensitive   = true
}

output "database_connection_string_pooled" {
  description = "PostgreSQL pooled connection string (for API)"
  value       = module.database.connection_string_pooled
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Container Registry
# -----------------------------------------------------------------------------

output "registry_endpoint" {
  description = "Container registry endpoint"
  value       = module.registry.endpoint
}

output "registry_namespace" {
  description = "Container registry namespace"
  value       = module.registry.namespace
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
# Storage
# -----------------------------------------------------------------------------

output "frontend_bucket_name" {
  description = "Frontend static files bucket name"
  value       = module.storage.frontend_bucket_name
}

output "frontend_bucket_endpoint" {
  description = "Frontend bucket S3 endpoint"
  value       = module.storage.frontend_bucket_endpoint
}

output "frontend_website_endpoint" {
  description = "Frontend website endpoint"
  value       = module.storage.frontend_bucket_website_endpoint
}

output "public_uploads_bucket" {
  description = "Public uploads bucket name"
  value       = module.storage.public_uploads_bucket_name
}

output "private_uploads_bucket" {
  description = "Private uploads bucket name"
  value       = module.storage.private_uploads_bucket_name
}

# -----------------------------------------------------------------------------
# Load Balancer (only if custom domain enabled)
# -----------------------------------------------------------------------------

output "load_balancer_ip" {
  description = "Load balancer public IP"
  value       = var.enable_custom_domain ? module.load_balancer[0].ip_address : null
}

# -----------------------------------------------------------------------------
# Monitoring
# -----------------------------------------------------------------------------

output "grafana_url" {
  description = "Grafana dashboard URL"
  value       = module.monitoring.endpoints.grafana
}

output "grafana_user" {
  description = "Grafana admin username"
  value       = module.monitoring.grafana_user
}

# -----------------------------------------------------------------------------
# Deployment Commands
# -----------------------------------------------------------------------------

output "docker_login_command" {
  description = "Docker login command for registry"
  value       = "docker login ${module.registry.endpoint} -u nologin --password-stdin <<< $SCW_SECRET_KEY"
}

output "deploy_frontend_command" {
  description = "Command to deploy frontend to storage"
  value       = "aws s3 sync frontend/dist s3://${module.storage.frontend_bucket_name}/ --endpoint-url https://s3.${var.region}.scw.cloud --delete"
}

output "run_migrations_command" {
  description = "Command to run database migrations"
  value       = "DATABASE_ADMIN_URL='<see database_connection_string_direct>' pnpm --filter backend db:migrate"
}
