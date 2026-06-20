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
  description = "Scaleway zone for the temporary builder server and image. Must match the deploy zone so the instance image lookup finds it."
  default     = "nl-ams-1"
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

variable "image_name" {
  type        = string
  description = "Stable Scaleway image name. compute.ts resolves the NEWEST image with this name at deploy time (no UUID paste), so it must stay stable across bakes."
  default     = "cella-docker-node-agent-v1"
}

variable "agent_binary" {
  type        = string
  description = "Local self-contained boot agent binary (Node SEA). Run pnpm --filter infra agent:build first."
  default     = "agent/dist/cella-boot-agent"
}

locals {
  build_timestamp = formatdate("YYYYMMDD-hhmmss", timestamp())
}

source "scaleway" "compute_docker" {
  project_id      = var.project_id
  access_key      = var.access_key
  secret_key      = var.secret_key
  zone            = var.zone
  image           = var.source_image
  commercial_type = var.commercial_type
  ssh_username    = "root"

  # Image name stays stable across bakes; compute.ts picks the newest one by name
  # (`getImage latest=true`). The builder VM name carries the timestamp to avoid
  # collisions between concurrent/repeat bakes.
  image_name  = var.image_name
  server_name = "${var.image_name}-builder-${local.build_timestamp}"

  remove_volume           = true
  server_creation_timeout = "10m"
  server_shutdown_timeout = "10m"
  image_creation_timeout  = "1h"
}

build {
  name    = "compute-docker"
  sources = ["source.scaleway.compute_docker"]

  provisioner "file" {
    source      = var.agent_binary
    destination = "/tmp/cella-boot-agent"
  }

  provisioner "shell" {
    inline_shebang = "/bin/bash -e"
    inline = [
      "set -euxo pipefail",
      "export DEBIAN_FRONTEND=noninteractive",
      "apt-get update -qq",
      "apt-get install -y -qq --no-install-recommends ca-certificates curl",
      "install -m 0755 -d /etc/apt/keyrings",
      "curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc",
      "chmod a+r /etc/apt/keyrings/docker.asc",
      "echo \"deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable\" > /etc/apt/sources.list.d/docker.list",
      "apt-get update -qq",
      "apt-get install -y -qq --no-install-recommends docker-ce docker-ce-cli containerd.io docker-compose-plugin",
      "systemctl enable --now docker",
      "install -m 0755 /tmp/cella-boot-agent /usr/local/bin/cella-boot-agent",
      "docker --version",
      "docker compose version",
      "cella-boot-agent --version",
      "cella-boot-agent supports --schema-version 1",
      "systemctl is-enabled docker",
      "apt-get clean",
      "rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*",
    ]
  }
}