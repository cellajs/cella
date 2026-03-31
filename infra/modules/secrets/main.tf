# Secrets Module - Scaleway Secret Manager

variable "name_prefix" {
  type = string
}

variable "env" {
  type = string
}

variable "region" {
  type = string
}

variable "database_url_direct" {
  type      = string
  sensitive = true
}

variable "database_url_pooled" {
  type      = string
  sensitive = true
}

variable "database_url_admin" {
  type      = string
  sensitive = true
}

variable "argon_secret" {
  type      = string
  sensitive = true
}

variable "cookie_secret" {
  type      = string
  sensitive = true
}

variable "unsubscribe_secret" {
  type      = string
  sensitive = true
}

variable "cdc_secret" {
  type      = string
  sensitive = true
}

variable "yjs_secret" {
  type      = string
  sensitive = true
}

variable "tags" {
  type = list(string)
}

# -----------------------------------------------------------------------------
# Secrets
# -----------------------------------------------------------------------------

resource "scaleway_secret" "database_url_direct" {
  name        = "${var.env}/cella/database-url-direct"
  description = "PostgreSQL direct connection string (for CDC and migrations)"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "database_url_direct" {
  secret_id = scaleway_secret.database_url_direct.id
  data      = var.database_url_direct
}

resource "scaleway_secret" "database_url_pooled" {
  name        = "${var.env}/cella/database-url-pooled"
  description = "PostgreSQL pooled connection string (for backend API)"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "database_url_pooled" {
  secret_id = scaleway_secret.database_url_pooled.id
  data      = var.database_url_pooled
}

resource "scaleway_secret" "database_url_admin" {
  name        = "${var.env}/cella/database-url-admin"
  description = "PostgreSQL admin connection string (for migrations and role management)"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "database_url_admin" {
  secret_id = scaleway_secret.database_url_admin.id
  data      = var.database_url_admin
}

resource "scaleway_secret" "argon_secret" {
  name        = "${var.env}/cella/argon-secret"
  description = "Argon2id password hashing secret"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "argon_secret" {
  secret_id = scaleway_secret.argon_secret.id
  data      = var.argon_secret
}

resource "scaleway_secret" "cookie_secret" {
  name        = "${var.env}/cella/cookie-secret"
  description = "Cookie signing secret"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "cookie_secret" {
  secret_id = scaleway_secret.cookie_secret.id
  data      = var.cookie_secret
}

resource "scaleway_secret" "unsubscribe_secret" {
  name        = "${var.env}/cella/unsubscribe-token-secret"
  description = "Email unsubscribe token secret"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "unsubscribe_secret" {
  secret_id = scaleway_secret.unsubscribe_secret.id
  data      = var.unsubscribe_secret
}

resource "scaleway_secret" "cdc_secret" {
  name        = "${var.env}/cella/cdc-secret"
  description = "CDC authentication secret"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "cdc_secret" {
  secret_id = scaleway_secret.cdc_secret.id
  data      = var.cdc_secret
}

resource "scaleway_secret" "yjs_secret" {
  name        = "${var.env}/cella/yjs-secret"
  description = "Yjs WebSocket authentication secret"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "yjs_secret" {
  secret_id = scaleway_secret.yjs_secret.id
  data      = var.yjs_secret
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "secret_ids" {
  value = {
    database_url_direct      = scaleway_secret.database_url_direct.id
    database_url_pooled      = scaleway_secret.database_url_pooled.id
    database_url_admin       = scaleway_secret.database_url_admin.id
    argon_secret             = scaleway_secret.argon_secret.id
    cookie_secret            = scaleway_secret.cookie_secret.id
    unsubscribe_secret = scaleway_secret.unsubscribe_secret.id
    cdc_secret               = scaleway_secret.cdc_secret.id
    yjs_secret               = scaleway_secret.yjs_secret.id
  }
  description = "Map of secret names to their IDs for container references"
}
