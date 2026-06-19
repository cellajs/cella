packer {
  required_plugins {
    scaleway = {
      source  = "github.com/scaleway/scaleway"
      version = ">= 1.4.0"
    }
  }
}

variable "project_id" {
  type        = string
  description = "Scaleway project ID. Defaults to SCW_DEFAULT_PROJECT_ID."
  default     = env("SCW_DEFAULT_PROJECT_ID")
}

variable "access_key" {
  type        = string
  description = "Scaleway access key. Defaults to SCW_ACCESS_KEY."
  default     = env("SCW_ACCESS_KEY")
  sensitive   = true
}

variable "secret_key" {
  type        = string
  description = "Scaleway secret key. Defaults to SCW_SECRET_KEY."
  default     = env("SCW_SECRET_KEY")
  sensitive   = true
}

variable "zone" {
  type        = string
  description = "Scaleway zone for the temporary builder server and image."
  default     = "fr-par-1"
}

variable "source_image" {
  type        = string
  description = "Marketplace image label or local image UUID used as the base image."
  default     = "ubuntu_noble"
}

variable "commercial_type" {
  type        = string
  description = "Temporary builder server type."
  default     = "DEV1-S"
}

variable "image_name_prefix" {
  type        = string
  description = "Prefix for the baked Scaleway image name."
  default     = "cella-docker-ubuntu-noble"
}

locals {
  build_timestamp = formatdate("YYYYMMDD-hhmmss", timestamp())
  image_name      = "${var.image_name_prefix}-${local.build_timestamp}"
}

source "scaleway" "compute_docker" {
  project_id      = var.project_id
  access_key      = var.access_key
  secret_key      = var.secret_key
  zone            = var.zone
  image           = var.source_image
  commercial_type = var.commercial_type
  ssh_username    = "root"

  image_name    = local.image_name
  snapshot_name = "${local.image_name}-root"
  server_name   = "${local.image_name}-builder"

  remove_volume             = true
  server_creation_timeout   = "10m"
  server_shutdown_timeout   = "10m"
  snapshot_creation_timeout = "1h"
  image_creation_timeout    = "1h"
}

build {
  name    = "compute-docker"
  sources = ["source.scaleway.compute_docker"]

  provisioner "shell" {
    inline = [
      "set -euxo pipefail",
      "export DEBIAN_FRONTEND=noninteractive",
      "apt-get update -qq",
      "apt-get install -y -qq ca-certificates curl",
      "install -m 0755 -d /etc/apt/keyrings",
      "curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc",
      "chmod a+r /etc/apt/keyrings/docker.asc",
      "echo \"deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable\" > /etc/apt/sources.list.d/docker.list",
      "apt-get update -qq",
      "apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin",
      "systemctl enable --now docker",
      "docker --version",
      "docker compose version",
      "systemctl is-enabled docker",
      "apt-get clean",
      "rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*",
    ]
  }
}