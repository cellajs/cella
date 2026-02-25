# =============================================================================
# Storage Module - Object Storage for Frontend + Uploads
# =============================================================================

terraform {
  required_providers {
    scaleway = {
      source = "scaleway/scaleway"
    }
  }
}

variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "tags" {
  type = list(string)
}

variable "project_id" {
  type        = string
  description = "Scaleway project ID for bucket ownership"
}

variable "bucket_suffix" {
  type        = string
  description = "Suffix to append to bucket names (for recreating locked buckets)"
  default     = ""
}

# -----------------------------------------------------------------------------
# Frontend Static Files Bucket (website hosting)
# -----------------------------------------------------------------------------

resource "scaleway_object_bucket" "frontend" {
  name       = "${var.name_prefix}-frontend${var.bucket_suffix}"
  region     = var.region
  project_id = var.project_id
  tags       = { for tag in var.tags : split(":", tag)[0] => split(":", tag)[1] }

  # Use public-read ACL instead of bucket policy to avoid locking out owner
  acl = "public-read"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    id      = "cleanup-old-versions"
    enabled = true

    expiration {
      days = 90
    }
  }
}

# Website configuration for SPA
resource "scaleway_object_bucket_website_configuration" "frontend" {
  bucket = scaleway_object_bucket.frontend.name
  region = var.region

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html" # SPA fallback - all routes serve index.html
  }

  depends_on = [scaleway_object_bucket.frontend]
}

# -----------------------------------------------------------------------------
# Public Uploads Bucket (user-uploaded public assets)
# -----------------------------------------------------------------------------

resource "scaleway_object_bucket" "public_uploads" {
  name       = "${var.name_prefix}-public-uploads${var.bucket_suffix}"
  region     = var.region
  project_id = var.project_id
  tags       = { for tag in var.tags : split(":", tag)[0] => split(":", tag)[1] }

  # Use public-read ACL instead of bucket policy to avoid locking out owner
  acl = "public-read"

  versioning {
    enabled = false
  }

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"]
    max_age_seconds = 3600
  }
}

# -----------------------------------------------------------------------------
# Private Uploads Bucket (user-uploaded private assets)
# -----------------------------------------------------------------------------

resource "scaleway_object_bucket" "private_uploads" {
  name       = "${var.name_prefix}-private-uploads${var.bucket_suffix}"
  region     = var.region
  project_id = var.project_id
  tags       = { for tag in var.tags : split(":", tag)[0] => split(":", tag)[1] }

  # Private bucket - no public access
  acl = "private"

  versioning {
    enabled = false
  }

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"]
    max_age_seconds = 3600
  }
}

# Private bucket - access via signed URLs only (no policy needed)

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "frontend_bucket_id" {
  value = scaleway_object_bucket.frontend.id
}

output "frontend_bucket_name" {
  value = scaleway_object_bucket.frontend.name
}

output "frontend_bucket_endpoint" {
  value = "https://${scaleway_object_bucket.frontend.name}.s3.${var.region}.scw.cloud"
}

output "frontend_bucket_website_endpoint" {
  value = scaleway_object_bucket_website_configuration.frontend.website_endpoint
}

output "public_uploads_bucket_name" {
  value = scaleway_object_bucket.public_uploads.name
}

output "public_uploads_bucket_endpoint" {
  value = "https://${scaleway_object_bucket.public_uploads.name}.s3.${var.region}.scw.cloud"
}

output "private_uploads_bucket_name" {
  value = scaleway_object_bucket.private_uploads.name
}

output "private_uploads_bucket_endpoint" {
  value = "https://${scaleway_object_bucket.private_uploads.name}.s3.${var.region}.scw.cloud"
}
