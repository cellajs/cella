# Network Module - Private Network for internal communication

variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "tags" {
  type = list(string)
}

# -----------------------------------------------------------------------------
# VPC
# -----------------------------------------------------------------------------

resource "scaleway_vpc" "main" {
  name   = "${var.name_prefix}-vpc"
  region = var.region
  tags   = var.tags
}

# -----------------------------------------------------------------------------
# Private Network
# -----------------------------------------------------------------------------

resource "scaleway_vpc_private_network" "main" {
  name   = "${var.name_prefix}-private-network"
  vpc_id = scaleway_vpc.main.id
  region = var.region
  tags   = var.tags

  ipv4_subnet {
    subnet = "10.0.0.0/24"
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "vpc_id" {
  value = scaleway_vpc.main.id
}

output "private_network_id" {
  value = scaleway_vpc_private_network.main.id
}

output "private_network_subnet" {
  value = scaleway_vpc_private_network.main.ipv4_subnet[0].subnet
}
