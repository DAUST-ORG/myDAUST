variable "session_secret" {
  type      = string
  sensitive = true
}

variable "student_activation_code_key_v1" {
  type        = string
  sensitive   = true
  description = "Dedicated 32-byte base64url HMAC key for student activation pairing codes"
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{43}$", var.student_activation_code_key_v1))
    error_message = "student_activation_code_key_v1 must be an unpadded 32-byte base64url value (43 characters)."
  }
}

variable "resend_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "admin_cidr" {
  type        = string
  description = "CIDR allowed to reach RDS for migrations, e.g. 1.2.3.4/32"
  validation {
    condition     = can(cidrnetmask(var.admin_cidr)) && endswith(var.admin_cidr, "/32")
    error_message = "admin_cidr must be a single-host /32 CIDR (never 0.0.0.0/0 — RDS is internet-reachable in staging)."
  }
}

variable "api_image" {
  type = string
}

variable "portal_image" {
  type = string
}

variable "tunnel_creds" {
  type      = string
  sensitive = true
  default   = "" # cloudflared tunnel credentials JSON; empty skips the tunnel service
}

variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cloudflare API token with DNS:Edit on the daust.net zone. Empty = leave DNS unmanaged (records stay out-of-band). See dns.tf."
}

variable "tunnel_image" {
  type    = string
  default = "" # ECR image with baked ingress config (infra/tunnel)
}
