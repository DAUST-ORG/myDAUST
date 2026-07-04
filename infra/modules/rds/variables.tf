variable "env" {
  type = string
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "engine_version" {
  type    = string
  default = "16"
}

variable "db_name" {
  type    = string
  default = "mydaust"
}

variable "username" {
  type    = string
  default = "mydaust"
}

variable "password" {
  type      = string
  sensitive = true
}

variable "db_subnet_group_name" {
  type = string
}

variable "security_group_ids" {
  type = list(string)
}

variable "publicly_accessible" {
  type    = bool
  default = false
}

variable "allocated_storage" {
  type    = number
  default = 20
}
