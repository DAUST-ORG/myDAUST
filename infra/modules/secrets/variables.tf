variable "env" {
  type = string
}

variable "secrets" {
  type      = map(string)
  sensitive = true
}
