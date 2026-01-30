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

  volume_type       = "bssd"
  volume_size_in_gb = var.volume_size_gb

  is_ha_cluster     = var.node_type != "DB-DEV-S" # HA for non-dev instances
  disable_backup    = var.node_type == "DB-DEV-S" # Backups for non-dev only

  # Enable logical replication for CDC
  settings = {
    wal_level             = "logical"
    max_wal_senders       = "10"
    max_replication_slots = "10"
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Private Network Endpoint
# -----------------------------------------------------------------------------

resource "scaleway_rdb_private_network_endpoint" "main" {
  instance_id        = scaleway_rdb_instance.main.id
  private_network_id = var.private_network_id
  region             = var.region
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

resource "scaleway_rdb_database" "main" {
  instance_id = scaleway_rdb_instance.main.id
  name        = "cella"
}

# -----------------------------------------------------------------------------
# Database User
# -----------------------------------------------------------------------------

resource "random_password" "db_password" {
  length  = 32
  special = false
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
  value     = scaleway_rdb_private_network_endpoint.main.ip
  sensitive = true
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
  value     = "postgresql://${scaleway_rdb_user.app.name}:${random_password.db_password.result}@${scaleway_rdb_private_network_endpoint.main.ip}:5432/${scaleway_rdb_database.main.name}?sslmode=require"
  sensitive = true
}

# Pooled connection string for backend API (uses connection pooler)
output "connection_string_pooled" {
  value     = "postgresql://${scaleway_rdb_user.app.name}:${random_password.db_password.result}@${scaleway_rdb_private_network_endpoint.main.ip}:6432/${scaleway_rdb_database.main.name}?sslmode=require"
  sensitive = true
}
