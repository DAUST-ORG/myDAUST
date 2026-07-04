variable "session_secret" {
  type      = string
  sensitive = true
}

variable "paytech_api_key" {
  type      = string
  sensitive = true
}

variable "paytech_api_secret" {
  type      = string
  sensitive = true
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

variable "tunnel_token" {
  type      = string
  sensitive = true
  default   = "" # cloudflared tunnel token; empty skips the tunnel service
}
