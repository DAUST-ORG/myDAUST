# myDAUST infrastructure (OpenTofu)

All commands assume `AWS_PROFILE=961828155948_DAUST_ADMIN` and region `us-east-1`.

## 1. Bootstrap (once)

Creates the S3 state bucket (`daust-tfstate-961828155948`) with local state:

```sh
cd infra/bootstrap
tofu init && tofu apply
```

## 2. Staging

```sh
cd infra/environments/staging
cp staging.auto.tfvars.example staging.auto.tfvars   # fill in real values (gitignored)
tofu init
tofu plan
tofu apply
```

Note: the ECS services need images in ECR. On the very first apply the ECR
repos are created in the same run; push images (below) and re-apply or let
ECS retry pulling.

## 3. Build and push images

```sh
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 961828155948.dkr.ecr.us-east-1.amazonaws.com

# API
docker build --platform linux/arm64 -f apps/api/Dockerfile -t daust-api .
docker tag daust-api:latest 961828155948.dkr.ecr.us-east-1.amazonaws.com/daust-api:latest
docker push 961828155948.dkr.ecr.us-east-1.amazonaws.com/daust-api:latest

# Portal
docker build --platform linux/arm64 -f apps/portal/Dockerfile -t daust-portal .
docker tag daust-portal:latest 961828155948.dkr.ecr.us-east-1.amazonaws.com/daust-portal:latest
docker push 961828155948.dkr.ecr.us-east-1.amazonaws.com/daust-portal:latest
```

## 4. Database migrations

RDS is publicly accessible in staging but SG-locked to `admin_cidr` and the
ECS task SG. Get the connection pieces from outputs:

```sh
tofu output rds_address
tofu output -raw db_password
```

Then from the repo root:

```sh
DATABASE_URL="postgresql://mydaust:<password>@<rds_address>:5432/mydaust?schema=public" \
  pnpm --filter @mydaust/db exec prisma migrate deploy
```

## Pending

- Cloudflare DNS + TLS in front of the ALB (listener is plain :80 for now;
  `COOKIE_SECURE=false` until then).
- Production environment (private DB subnets, deletion protection, HTTPS).
