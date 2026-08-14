module "network" {
  source = "../../modules/network"

  env  = "prod"
  cidr = "10.61.0.0/16"
}


resource "aws_ecs_cluster" "this" {
  name = "daust-prod"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_security_group" "tasks" {
  name        = "daust-prod-tasks"
  description = "ECS tasks - traffic from ALB only"
  vpc_id      = module.network.vpc_id

  ingress {
    description     = "API from ALB"
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [module.alb.alb_sg_id]
  }

  ingress {
    description     = "Portal from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [module.alb.alb_sg_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "daust-prod-tasks"
  }
}

resource "aws_security_group" "db" {
  name        = "daust-prod-db"
  description = "RDS - tasks plus operator CIDR for migrations"
  vpc_id      = module.network.vpc_id

  ingress {
    description     = "Postgres from ECS tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.tasks.id]
  }

  ingress {
    description = "Postgres from operator (migrations)"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "daust-prod-db"
  }
}

module "rds" {
  source = "../../modules/rds"

  env                  = "prod"
  password             = random_password.db.result
  db_subnet_group_name = module.network.db_subnet_group_name
  security_group_ids   = [aws_security_group.db.id]
  # SG-locked to the task SG + var.admin_cidr so migrations can run from the
  # operator's machine. Flip to private once CI or a bastion owns migrations.
  publicly_accessible = true
  instance_class      = "db.t4g.small"
  deletion_protection = true
  skip_final_snapshot = false
}

module "alb" {
  source = "../../modules/alb"

  env        = "prod"
  vpc_id     = module.network.vpc_id
  subnet_ids = module.network.public_subnet_ids
}

locals {
  alb_url      = "http://${module.alb.alb_dns_name}"
  public_url   = "https://my.daust.net"      # prod domain (zone on Cloudflare; my-daust.azt.dev kept as tunnel alias)
  vitrine_url  = "https://daust.net"         # prod vitrine (prod bucket via the prod tunnel)
  payment_url  = "https://payment.daust.net" # public bill portal (same portal image, tunnel-routed to the ALB)
  database_url = "postgresql://mydaust:${random_password.db.result}@${module.rds.address}:5432/mydaust?schema=public"
}

module "wire_proofs" {
  source      = "../../modules/private-bucket"
  bucket_name = "daust-prod-wire-proofs-961828155948"
  tags        = { DataClassification = "financial-confidential" }
}

module "media" {
  source      = "../../modules/private-bucket"
  bucket_name = "daust-prod-media-961828155948"
  tags        = { DataClassification = "public-site-media" }
}

module "transcript_imports" {
  source      = "../../modules/private-bucket"
  bucket_name = "daust-prod-transcript-imports-961828155948"
  tags        = { DataClassification = "academic-confidential" }
}

module "secrets" {
  source = "../../modules/secrets"

  env = "prod"
  # RESEND_API_KEY joins only when set — Secrets Manager rejects an empty SecretString.
  secrets = merge({
    DATABASE_URL   = local.database_url
    SESSION_SECRET = var.session_secret
    },
    var.resend_api_key != "" ? { RESEND_API_KEY = var.resend_api_key } : {},
    var.tunnel_creds != "" ? { TUNNEL_CREDS = var.tunnel_creds } : {},
  )
}

module "api_service" {
  source = "../../modules/ecs-service"

  env                = "prod"
  name               = "api"
  cluster_id         = aws_ecs_cluster.this.id
  image              = var.api_image
  container_port     = 4000
  cpu                = 256
  memory             = 1024
  subnet_ids         = module.network.public_subnet_ids
  security_group_ids = [aws_security_group.tasks.id]
  target_group_arn   = module.alb.api_tg_arn

  environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "4000" },
    # Cloudflare tunnel terminates TLS at the edge; browsers are on https.
    { name = "COOKIE_SECURE", value = "true" },
    { name = "PORTAL_ORIGIN", value = local.public_url },
    { name = "VITRINE_ORIGIN", value = local.vitrine_url },
    { name = "PAYMENT_ORIGIN", value = local.payment_url },
    { name = "WIRE_PROOFS_BUCKET", value = module.wire_proofs.name },
    { name = "MEDIA_BUCKET", value = module.media.name },
    { name = "TRANSCRIPT_IMPORT_BUCKET", value = module.transcript_imports.name },
    { name = "MAIL_FROM", value = "myDAUST <no-reply@updates.daust.net>" },
  ]

  secrets = concat(
    [
      { name = "DATABASE_URL", valueFrom = module.secrets.arns["DATABASE_URL"] },
      { name = "SESSION_SECRET", valueFrom = module.secrets.arns["SESSION_SECRET"] },
    ],
    var.resend_api_key != "" ? [{ name = "RESEND_API_KEY", valueFrom = module.secrets.arns["RESEND_API_KEY"] }] : [],
  )

  secret_arns = values(module.secrets.arns)
  task_policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject"]
        Resource = [
          "${module.wire_proofs.arn}/wire-proofs/*",
          "${module.wire_proofs.arn}/payment-files/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${module.media.arn}/uploads/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = module.media.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["uploads/*"]
          }
        }
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${module.transcript_imports.arn}/transcript-imports/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = module.transcript_imports.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["transcript-imports/*"]
          }
        }
      }
    ]
  })
}

module "portal_service" {
  source = "../../modules/ecs-service"

  env                = "prod"
  name               = "portal"
  cluster_id         = aws_ecs_cluster.this.id
  image              = var.portal_image
  container_port     = 3000
  cpu                = 256
  memory             = 512
  subnet_ids         = module.network.public_subnet_ids
  security_group_ids = [aws_security_group.tasks.id]
  target_group_arn   = module.alb.portal_tg_arn

  environment = [
    { name = "HOSTNAME", value = "0.0.0.0" },
    { name = "PORT", value = "3000" },
  ]
}

# Vitrine: static export in S3, served through the tunnel (host-routed in infra/tunnel/config.yml).
module "vitrine_site" {
  source      = "../../modules/static-site"
  bucket_name = "daust-prod-vitrine-961828155948"
}

# Cloudflare tunnel connector: egress-only, forwards edge traffic by hostname
# (daust-prod.azt.dev -> ALB, daust.azt.dev -> vitrine S3). Ingress lives in the
# baked image config (infra/tunnel/config.yml); credentials arrive via Secrets Manager.
module "tunnel_service" {
  count  = var.tunnel_creds != "" && var.tunnel_image != "" ? 1 : 0
  source = "../../modules/ecs-service"

  env                = "prod"
  name               = "tunnel"
  cluster_id         = aws_ecs_cluster.this.id
  image              = var.tunnel_image
  container_port     = 2000 # metrics port only; no LB attachment
  cpu                = 256
  memory             = 512
  subnet_ids         = module.network.public_subnet_ids
  security_group_ids = [aws_security_group.tasks.id]

  secrets     = [{ name = "TUNNEL_CREDS", valueFrom = module.secrets.arns["TUNNEL_CREDS"] }]
  secret_arns = values(module.secrets.arns)
}
