terraform {
  required_providers {
    scaleway = {
      source = "scaleway/scaleway"
    }
  }
}

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

variable "argon_secret" {
  type      = string
  sensitive = true
}

variable "cookie_secret" {
  type      = string
  sensitive = true
}

variable "unsubscribe_token_secret" {
  type      = string
  sensitive = true
}

variable "cdc_ws_secret" {
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
  name        = "${var.env}_cella_database-url-direct"
  description = "PostgreSQL direct connection string (for CDC and migrations)"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "database_url_direct" {
  secret_id = scaleway_secret.database_url_direct.id
  data      = var.database_url_direct
}

resource "scaleway_secret" "database_url_pooled" {
  name        = "${var.env}_cella_database-url-pooled"
  description = "PostgreSQL pooled connection string (for backend API)"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "database_url_pooled" {
  secret_id = scaleway_secret.database_url_pooled.id
  data      = var.database_url_pooled
}

resource "scaleway_secret" "argon_secret" {
  name        = "${var.env}_cella_argon-secret"
  description = "Argon2id password hashing secret"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "argon_secret" {
  secret_id = scaleway_secret.argon_secret.id
  data      = var.argon_secret
}

resource "scaleway_secret" "cookie_secret" {
  name        = "${var.env}_cella_cookie-secret"
  description = "Cookie signing secret"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "cookie_secret" {
  secret_id = scaleway_secret.cookie_secret.id
  data      = var.cookie_secret
}

resource "scaleway_secret" "unsubscribe_token_secret" {
  name        = "${var.env}_cella_unsubscribe-token-secret"
  description = "Email unsubscribe token secret"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "unsubscribe_token_secret" {
  secret_id = scaleway_secret.unsubscribe_token_secret.id
  data      = var.unsubscribe_token_secret
}

resource "scaleway_secret" "cdc_ws_secret" {
  name        = "${var.env}_cella_cdc-ws-secret"
  description = "CDC WebSocket authentication secret"
  region      = var.region
  tags        = var.tags
}

resource "scaleway_secret_version" "cdc_ws_secret" {
  secret_id = scaleway_secret.cdc_ws_secret.id
  data      = var.cdc_ws_secret
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "secret_ids" {
  value = {
    database_url_direct      = scaleway_secret.database_url_direct.id
    database_url_pooled      = scaleway_secret.database_url_pooled.id
    argon_secret             = scaleway_secret.argon_secret.id
    cookie_secret            = scaleway_secret.cookie_secret.id
    unsubscribe_token_secret = scaleway_secret.unsubscribe_token_secret.id
    cdc_ws_secret            = scaleway_secret.cdc_ws_secret.id
  }
  description = "Map of secret names to their IDs for container references"
}
