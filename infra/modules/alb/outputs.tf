output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "alb_sg_id" {
  value = aws_security_group.alb.id
}

output "api_tg_arn" {
  value = aws_lb_target_group.api.arn
}

output "portal_tg_arn" {
  value = aws_lb_target_group.portal.arn
}

output "alb_arn" {
  value = aws_lb.this.arn
}
