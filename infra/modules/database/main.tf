terraform {
  required_providers {
    scaleway = {
      source = "scaleway/scaleway"
    }
  }
}

# Database Module - Managed PostgreSQL with logical replication

variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "node_type" {
  type    = string
  default = "DB-DEV-S"
}

variable "volume_size_gb" {
  type    = number
  default = 10
}

variable "private_network_id" {
  type = string
}

variable "tags" {
  type = list(string)
}

# -----------------------------------------------------------------------------
# PostgreSQL Instance
# -----------------------------------------------------------------------------

resource "scaleway_rdb_instance" "main" {
  name      = "${var.name_prefix}-postgres"
  region    = var.region
  node_type = var.node_type
  engine    = "PostgreSQL-17"

  volume_type       = "sbs_5k" # SBS 5k IOPS volume (bssd is deprecated)
  volume_size_in_gb = var.volume_size_gb

  is_ha_cluster  = var.node_type != "DB-DEV-S" # HA for non-dev instances
  disable_backup = var.node_type == "DB-DEV-S" # Backups for non-dev only

  # Note: wal_level=logical for CDC must be configured via Scaleway Console
  # or after instance creation, as it's not available as a Terraform setting
  # on DB-DEV-S instances

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Private Network Endpoint
# Note: Scaleway RDB uses private_network block on the instance itself
# The connection uses the load_balancer endpoint by default
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

resource "scaleway_rdb_database" "main" {
  instance_id = scaleway_rdb_instance.main.id
  name        = "cella"

  depends_on = [scaleway_rdb_user.app]
}

# -----------------------------------------------------------------------------
# Database User
# -----------------------------------------------------------------------------

resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!@#$%^&*"
}

resource "scaleway_rdb_user" "app" {
  instance_id = scaleway_rdb_instance.main.id
  name        = "cella_app"
  password    = random_password.db_password.result
  is_admin    = true # Needed for logical replication
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "id" {
  value = scaleway_rdb_instance.main.id
}

output "host" {
  value     = scaleway_rdb_instance.main.endpoint_ip
  sensitive = true
}

output "endpoint_ip" {
  value = scaleway_rdb_instance.main.endpoint_ip
}

output "endpoint_port" {
  value = scaleway_rdb_instance.main.endpoint_port
}

output "port" {
  value = 5432
}

output "pooler_port" {
  value = 6432
}

output "database_name" {
  value = scaleway_rdb_database.main.name
}

output "username" {
  value     = scaleway_rdb_user.app.name
  sensitive = true
}

output "password" {
  value     = random_password.db_password.result
  sensitive = true
}

# Direct connection string for CDC and migrations (bypasses pooler)
output "connection_string_direct" {
  value     = "postgresql://${scaleway_rdb_user.app.name}:${random_password.db_password.result}@${scaleway_rdb_instance.main.endpoint_ip}:${scaleway_rdb_instance.main.endpoint_port}/${scaleway_rdb_database.main.name}?sslmode=require"
  sensitive = true
}

# Pooled connection string for backend API (uses connection pooler)
# Note: Scaleway RDB pooler runs on same port, pooling is handled internally
output "connection_string_pooled" {
  value     = "postgresql://${scaleway_rdb_user.app.name}:${random_password.db_password.result}@${scaleway_rdb_instance.main.endpoint_ip}:${scaleway_rdb_instance.main.endpoint_port}/${scaleway_rdb_database.main.name}?sslmode=require&pgbouncer=true"
  sensitive = true
}
