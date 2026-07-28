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
  api_token = var.cloudflare_api_token
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = "mydaust"
      Env       = "staging"
      ManagedBy = "opentofu"
    }
  }
}
