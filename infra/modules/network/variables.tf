variable "env" {
  type = string
}

variable "cidr" {
  type = string
}

variable "azs" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}
