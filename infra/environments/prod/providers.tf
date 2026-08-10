terraform {
  required_version = ">= 1.8"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# DNS for the app domains. Authenticates only when cloudflare_api_token is set;
# an empty token leaves the (opt-in) DNS resources unmanaged so existing operator
# `tofu plan` runs are unaffected. See dns.tf.
provider "cloudflare" {
  # Cloudflare v4 requires one syntactically valid credential even when the
  # opt-in DNS resources have count/for_each zero. This inert value is never
  # used for an API request while cloudflare_api_token is empty.
  api_token = var.cloudflare_api_token != "" ? var.cloudflare_api_token : "0000000000000000000000000000000000000000"
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = "mydaust"
      Env       = "prod"
      ManagedBy = "opentofu"
    }
  }
}
