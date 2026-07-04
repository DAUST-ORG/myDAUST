# Secret values transit OpenTofu state. The state bucket is encrypted (AES256)
# and fully private, which is acceptable for staging - revisit for prod
# (e.g. write values out-of-band and keep only ARNs in state).

terraform {
  required_version = ">= 1.8"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

resource "aws_secretsmanager_secret" "this" {
  # Keys are not secret themselves; unwrap sensitivity so for_each works.
  for_each = toset(nonsensitive(keys(var.secrets)))

  name                    = "daust-${var.env}/${each.value}"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each = aws_secretsmanager_secret.this

  secret_id     = each.value.id
  secret_string = var.secrets[each.key]
}
