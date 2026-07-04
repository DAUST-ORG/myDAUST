variable "env" {
  type = string
}

variable "name" {
  type = string
}

variable "cluster_id" {
  type = string
}

variable "image" {
  type = string
}

variable "container_port" {
  type = number
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_ids" {
  type = list(string)
}

variable "assign_public_ip" {
  type    = bool
  default = true
}

variable "target_group_arn" {
  type    = string
  default = "" # empty = no load balancer attachment (egress-only services like the Cloudflare tunnel)
}

variable "command" {
  type    = list(string)
  default = null
}

variable "environment" {
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "secrets" {
  type = list(object({
    name      = string
    valueFrom = string
  }))
  default = []
}

variable "secret_arns" {
  type    = list(string)
  default = []
}

variable "desired_count" {
  type    = number
  default = 1
}

