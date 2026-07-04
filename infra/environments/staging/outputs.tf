output "alb_url" {
  value = local.alb_url
}

output "rds_address" {
  value = module.rds.address
}

output "ecr_repo_urls" {
  value = module.ecr.repo_urls
}

output "db_password" {
  value     = random_password.db.result
  sensitive = true
}
