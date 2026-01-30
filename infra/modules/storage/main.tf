# Object Storage Module - Frontend static files + uploads

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
# Frontend Static Files Bucket (website hosting)
# -----------------------------------------------------------------------------

resource "scaleway_object_bucket" "frontend" {
  name   = "${var.name_prefix}-frontend"
  region = var.region
  tags   = { for tag in var.tags : split(":", tag)[0] => split(":", tag)[1] }

  # Enable versioning for rollback capability
  versioning {
    enabled = true
  }

  # Lifecycle rules for cleanup
  lifecycle_rule {
    id      = "cleanup-old-versions"
    enabled = true

    noncurrent_version_expiration {
      days = 30
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
}

# Public read access for frontend bucket
resource "scaleway_object_bucket_policy" "frontend_public" {
  bucket = scaleway_object_bucket.frontend.name
  region = var.region

  policy = jsonencode({
    Version = "2023-04-17"
    Statement = [
      {
        Sid       = "PublicRead"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = ["${scaleway_object_bucket.frontend.name}/*"]
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Public Uploads Bucket (user-uploaded public assets)
# -----------------------------------------------------------------------------

resource "scaleway_object_bucket" "public_uploads" {
  name   = "${var.name_prefix}-public"
  region = var.region
  tags   = { for tag in var.tags : split(":", tag)[0] => split(":", tag)[1] }

  versioning {
    enabled = false
  }

  # CORS configuration for uploads
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"] # Will be restricted by backend
    max_age_seconds = 3600
  }
}

resource "scaleway_object_bucket_policy" "public_uploads" {
  bucket = scaleway_object_bucket.public_uploads.name
  region = var.region

  policy = jsonencode({
    Version = "2023-04-17"
    Statement = [
      {
        Sid       = "PublicRead"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = ["${scaleway_object_bucket.public_uploads.name}/*"]
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Private Uploads Bucket (user-uploaded private assets)
# -----------------------------------------------------------------------------

resource "scaleway_object_bucket" "private_uploads" {
  name   = "${var.name_prefix}-private"
  region = var.region
  tags   = { for tag in var.tags : split(":", tag)[0] => split(":", tag)[1] }

  versioning {
    enabled = false
  }

  # CORS configuration for uploads
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"] # Will be restricted by backend
    max_age_seconds = 3600
  }
}

# Private bucket - no public policy, access via signed URLs only

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
