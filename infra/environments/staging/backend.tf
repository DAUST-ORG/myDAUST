terraform {
  backend "s3" {
    bucket       = "daust-tfstate-961828155948"
    key          = "staging/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
  }
}
