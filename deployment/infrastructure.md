# Infrastructure

AWS account **961828155948**, region **us-east-1**, everything defined as OpenTofu under
[`../infra/`](../infra/). Verified against the files on 2026-08-24; **not** verified against live
AWS, because this machine's credentials belong to a different account (see
[`README.md` §1](README.md#unverified-not-confirmed-against-live-aws)).

The account id, region, ECR host and deploy-role ARN are hardcoded in the `env:` block of
`.github/workflows/deploy.yml`. Moving to another account means editing that block as well as the
terraform.

---

## Terraform roots and state

Four roots. Each is applied independently.

| Root | State | Purpose |
| --- | --- | --- |
| `infra/bootstrap` | **local**, gitignored (`.gitignore:26-27`) | Creates the state bucket itself. Run once. |
| `infra/global` | `s3://daust-tfstate-961828155948/global/terraform.tfstate` | GitHub OIDC provider + `daust-github-deploy` role |
| `infra/environments/staging` | `.../staging/terraform.tfstate` | Staging environment **and the shared ECR repositories** |
| `infra/environments/prod` | `.../prod/terraform.tfstate` | Production environment |

State backend: `bucket = "daust-tfstate-961828155948"`, `region = "us-east-1"`,
`use_lockfile = true` (S3-native locking, no DynamoDB table). See
`infra/environments/prod/backend.tf`.

The bucket is created by `infra/bootstrap/main.tf` with versioning enabled, `AES256`
server-side encryption, all four public-access blocks on, and a bucket policy denying any request
where `aws:SecureTransport` is `false`.

> **Secret values transit state.** `infra/modules/secrets/main.tf` says so in its header comment:
> the module writes `DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY` and `TUNNEL_CREDS` into
> Secrets Manager from terraform variables, so all four appear in plaintext inside the state
> object. The bucket is private and encrypted, which the comment calls "acceptable for staging —
> revisit for prod". It was not revisited. Treat read access to `daust-tfstate-961828155948` as
> equivalent to production database credentials.

### ECR repositories live in the staging root

`infra/environments/staging/main.tf:8-12` instantiates `modules/ecr` with
`repos = ["api", "portal", "tunnel"]`. The prod root has no ECR module. Both environments push to
and pull from the same three repositories: `daust-api`, `daust-portal`, `daust-tunnel`.

Consequences worth knowing:
- Destroying the staging root destroys the registry production pulls from
  (`force_delete = true` in `infra/modules/ecr/main.tf`).
- `image_tag_mutability = "IMMUTABLE"` — a tag can never be re-pointed. This is why the deploy
  workflow probes for an existing tag before building.
- The lifecycle policy keeps only the **last 10 images per repository**. That is the hard limit on
  rollback depth.
- `scan_on_push = true`.

### Applying

```sh
export AWS_PROFILE=961828155948_DAUST_ADMIN     # infra/README.md
cd infra/environments/prod

export TF_VAR_session_secret=<32+ random chars>
export TF_VAR_admin_cidr=<your-public-ip>/32     # must be a /32; validated in variables.tf
export TF_VAR_api_image=961828155948.dkr.ecr.us-east-1.amazonaws.com/daust-api:<currently-running-tag>
export TF_VAR_portal_image=961828155948.dkr.ecr.us-east-1.amazonaws.com/daust-portal:<currently-running-tag>
export TF_VAR_tunnel_image=961828155948.dkr.ecr.us-east-1.amazonaws.com/daust-tunnel:<currently-running-tag>
export TF_VAR_tunnel_creds='<cloudflared credentials JSON>'
export TF_VAR_resend_api_key=<optional>
export TF_VAR_cloudflare_api_token=<optional; empty leaves DNS unmanaged>

tofu init
tofu plan
tofu apply
```

`infra/environments/prod/staging.auto.tfvars.example` documents this env-var approach and warns
against `.tfvars` files. That warning is now stale: `.gitignore:24-25` does ignore `*.tfvars`
(keeping `*.tfvars.example`). Env vars are still the better habit — they leave nothing on disk.

`admin_cidr` carries a validation block refusing anything that is not a single-host `/32`,
because RDS is internet-reachable.

> ### The apply-reverts-CI landmine
>
> `aws_ecs_service` in `infra/modules/ecs-service/main.tf` has **no**
> `lifecycle { ignore_changes = [task_definition] }`. An operator `tofu apply` therefore resets
> both services to `var.api_image` / `var.portal_image` and re-renders the container definition
> from the terraform `environment` list — dropping the three env vars deploy.yml injects at roll
> time (`TRANSCRIPT_IMPORT_BUCKET`, `VITRINE_ORIGIN`, `ADDITIONAL_CORS_ORIGINS`).
>
> Always pass the currently-running image tags when applying. Get them from
> `aws ecs describe-task-definition --task-definition daust-prod-api --query 'taskDefinition.containerDefinitions[0].image'`,
> or from the last successful deploy run.
>
> `ADDITIONAL_CORS_ORIGINS` is defined in **two** places that must stay identical: the jq map in
> `.github/workflows/deploy.yml` (*Roll API to the new image*) and the `environment` list in
> `infra/environments/prod/main.tf`. A narrower list in terraform silently drops origins CI set,
> which shows up as `daust.net` failing CORS against the API.

---

## Environments

| | staging | production |
| --- | --- | --- |
| Branch | `develop` | `main` |
| Terraform root | `infra/environments/staging` | `infra/environments/prod` |
| ECS cluster | `daust-staging` | `daust-prod` |
| VPC CIDR | `10.60.0.0/16` | `10.61.0.0/16` |
| App host | `daust-staging.azt.dev` | `my.daust.net` (+ `mydaust.daust.net`, `mydaust.daust.org`, `my-daust.azt.dev`) |
| Vitrine host | `daust.azt.dev` | `daust.net` (config also serves `daust.org`, `www.daust.org` — see below) |
| Payment host | same as app host | `payment.daust.net` (+ `payment.daust.org`, `payment.daust.azt.dev`) |
| RDS | `daust-staging-pg`, `db.t4g.micro` (module default) | `daust-prod-pg`, `db.t4g.small` |
| Cloudflare tunnel id | `38e2e4ee-2ca3-4918-8589-bc6876497e72` | `1510130a-e77f-486c-96af-52d4618350fb` |
| Deletion protection | off (module defaults) | `deletion_protection = true`, `skip_final_snapshot = false` |

**Vitrine host reality.** `infra/tunnel-prod/config.yml` has ingress for `daust.org`,
`www.daust.org` **and** `daust.net`, all pointing at the same prod vitrine bucket, and
`infra/environments/prod/main.tf` sets `local.vitrine_url = "https://daust.org"`. But the
`daust.org` apex DNS still points at the legacy WordPress site, deliberately (AGENTS.md §14). The
live new vitrine is on **`daust.net`**, which reaches the API cross-origin via
`ADDITIONAL_CORS_ORIGINS`. Do not "fix" the `daust.org` DNS.

---

## Production resource inventory

Everything below is read from `infra/environments/prod/main.tf` and the modules it calls.

### Network — `infra/modules/network`

- `aws_vpc` `10.61.0.0/16`, DNS support + hostnames on.
- Internet gateway.
- 2 public subnets (`cidrsubnet(cidr, 8, 0..1)`), `map_public_ip_on_launch = true`, across
  `var.azs[0..1]`.
- 2 "db" subnets (`cidrsubnet(cidr, 8, 10..11)`) plus an `aws_db_subnet_group` named
  `daust-prod`.
- One public route table (`0.0.0.0/0` -> IGW) associated with **both** the public subnets and the
  db subnets.
- S3 gateway VPC endpoint on the public route table.

> **The DB subnets are internet-routed in production too.** The comment above
> `aws_route_table_association.db` reads *"STAGING-ONLY … Do NOT copy this pattern to prod — prod
> DB subnets must be private."* The prod root calls the identical module, so the pattern is in
> prod. Combined with `publicly_accessible = true` on the instance, `daust-prod-pg` is reachable
> from the internet, gated only by the `daust-prod-db` security group. That is a deliberate
> trade-off (it is how migrations run from an operator laptop), but it is a single SG rule away
> from exposure. If you tighten one thing in this stack, tighten this.

### Compute — ECS

- `aws_ecs_cluster` **`daust-prod`**, container insights disabled.
- Three Fargate services from `infra/modules/ecs-service`, all `desired_count = 1`,
  `network_mode = "awsvpc"`, `cpu_architecture = "ARM64"`, in the **public** subnets with
  `assign_public_ip = true`:

| Service | Family | Port | CPU / mem | LB | Notes |
| --- | --- | --- | --- | --- | --- |
| `daust-prod-api` | `daust-prod-api` | 4000 | 256 / 1024 | api target group | Carries all secrets; also the image used for every one-off data task |
| `daust-prod-portal` | `daust-prod-portal` | 3000 | 256 / 512 | portal target group | Only `HOSTNAME` + `PORT`; no secrets |
| `daust-prod-tunnel` | `daust-prod-tunnel` | 2000 (metrics only) | 256 / 512 | none | `count = 0` unless both `tunnel_creds` and `tunnel_image` are set |

- Log groups `/ecs/daust-prod-{api,portal,tunnel}`, `retention_in_days = 30`, awslogs driver with
  stream prefix = service name. Stream names are `<prefix>/<container>/<task-id>` — the deploy
  workflow relies on that shape to read the reconciliation result.
- IAM per service: `daust-prod-<name>-execution` (AWS managed
  `AmazonECSTaskExecutionRolePolicy` + an inline `secretsmanager:GetSecretValue` on the secret
  ARNs) and `daust-prod-<name>-task` (only the api has an inline policy — least-privilege S3 for
  the three buckets, scoped to `wire-proofs/*`, `payment-files/*`, `uploads/*`,
  `transcript-imports/*`).

### Load balancer — `infra/modules/alb`

- `daust-prod-alb`, internet-facing, in the public subnets. Live DNS name (from
  `infra/tunnel-prod/config.yml`): `daust-prod-alb-1688944790.us-east-1.elb.amazonaws.com`.
- **One listener, port 80, HTTP. There is no TLS at the ALB.** TLS terminates at the Cloudflare
  edge and the tunnel forwards plain HTTP. This is why the API sets `COOKIE_SECURE=true`
  explicitly — it cannot infer it from the request.
- Default action forwards to the **portal** target group.
- Listener rule priority 10: path `/api/*` or `/uploads/*` -> **api** target group.
- Health checks: api `/api/health` matcher `200`; portal `/login` matcher `200-399`.
- SG `daust-prod-alb`: 80/tcp from `0.0.0.0/0`.

Because the ALB is directly reachable on the internet, `x-forwarded-for` is spoofable — which is
why `BillThrottleGuard` deliberately keys on `studentNo` rather than IP (AGENTS.md §6).

### Security groups

| SG | Ingress |
| --- | --- |
| `daust-prod-alb` | 80/tcp from anywhere |
| `daust-prod-tasks` | 4000/tcp and 3000/tcp **from the ALB SG only** |
| `daust-prod-db` | 5432/tcp from the tasks SG, and from `var.admin_cidr` (a single `/32`) |

All three allow unrestricted egress.

### Database — `infra/modules/rds`

Full detail in [`database.md`](database.md). Summary: `daust-prod-pg`, PostgreSQL 16,
`db.t4g.small`, 20 GB gp3, `storage_encrypted = true`, `backup_retention_period = 7`,
`deletion_protection = true`, `skip_final_snapshot = false`, `publicly_accessible = true`,
`apply_immediately = true`, db/user both `mydaust`.

### Storage — S3

| Bucket | Module | Visibility | Contents |
| --- | --- | --- | --- |
| `daust-prod-wire-proofs-961828155948` | `private-bucket` | private, versioned, SSE-AES256 | payment proof uploads (`wire-proofs/`, `payment-files/`) |
| `daust-prod-media-961828155948` | `private-bucket` | private, versioned, SSE-AES256 | CMS / portal uploads (`uploads/`) |
| `daust-prod-transcript-imports-961828155948` | `private-bucket` | private, versioned, SSE-AES256 | transcript import workbooks |
| `daust-prod-vitrine-961828155948` | `static-site` | **public read**, website endpoint, not versioned | the static vitrine export |
| `daust-tfstate-961828155948` | `bootstrap` | private, versioned, TLS-only | all terraform state |

The vitrine bucket's website endpoint is
`daust-prod-vitrine-961828155948.s3-website-us-east-1.amazonaws.com`. The tunnel must forward
`httpHostHeader` set to that hostname, because S3 website endpoints route by `Host`.

### Secrets Manager

Created by `infra/modules/secrets` as `daust-<env>/<KEY>` with
**`recovery_window_in_days = 0`** — deleting a secret is immediate and unrecoverable, there is no
7-day grace period. Production paths:

- `daust-prod/DATABASE_URL`
- `daust-prod/SESSION_SECRET`
- `daust-prod/RESEND_API_KEY` — created **only if** `var.resend_api_key != ""`
- `daust-prod/TUNNEL_CREDS` — created **only if** `var.tunnel_creds != ""`

Names only. Never paste a value into a document, a PR, or a chat.

---

## Cloudflare

### Tunnels

The connector runs as an ECS service; there is no inbound path from the internet to the VPC other
than the ALB. Credentials arrive as `TUNNEL_CREDS` from Secrets Manager and are written to
`/etc/cloudflared/creds.json` with `umask 077` by the entrypoint
(`infra/tunnel-prod/Dockerfile`).

**The ingress map is baked into the image.** `COPY config.yml /etc/cloudflared/config.yml`. A new
public hostname requires editing `infra/tunnel-prod/config.yml`, rebuilding and pushing
`daust-tunnel`, and rolling the service. There is no runtime config.

Prod ingress (`infra/tunnel-prod/config.yml`, tunnel `1510130a-e77f-486c-96af-52d4618350fb`):

| Hostname | Origin |
| --- | --- |
| `my.daust.net` | prod ALB |
| `mydaust.daust.net` | prod ALB |
| `mydaust.daust.org` | prod ALB |
| `my-daust.azt.dev` | prod ALB (transition alias) |
| `payment.daust.net` | prod ALB |
| `payment.daust.org` | prod ALB |
| `payment.daust.azt.dev` | prod ALB |
| `daust.org` | vitrine S3 website (`httpHostHeader` set) |
| `www.daust.org` | vitrine S3 website (`httpHostHeader` set) |
| `daust.net` | vitrine S3 website (`httpHostHeader` set) |
| *(catch-all)* | `http_status:404` |

Staging (`infra/tunnel/config.yml`, tunnel `38e2e4ee-2ca3-4918-8589-bc6876497e72`):
`daust-staging.azt.dev` -> staging ALB, `daust.azt.dev` -> staging vitrine bucket, catch-all 404.

### DNS

Mostly **out of band**. `infra/environments/prod/dns.tf` can manage the `daust.net` zone but is
opt-in: with an empty `cloudflare_api_token` the `for_each` maps are empty and nothing is planned.
Only `mydaust.daust.net` is uncommented; `my`, `payment` and the apex are commented out with a
note that adopting them requires `tofu import` first so apply adopts rather than recreates.

The pattern for every app hostname is a **proxied** CNAME to
`<tunnel-id>.cfargotunnel.com` with `ttl = 1` ("automatic", required when proxied).

The provider is pinned to `cloudflare/cloudflare ~> 4.0`. On v5 the resources are renamed
(`cloudflare_dns_record` with `content`, `cloudflare_zones` with a filter) — `dns.tf` says so.

**Adding a public hostname** touches five places (AGENTS.md §15): tunnel `config.yml` ingress
(with `httpHostHeader` for S3 origins) -> proxied CNAME -> `ADDITIONAL_CORS_ORIGINS` in **both**
the deploy.yml jq map and the env's `main.tf` -> `PAYMENT_HOSTS` in
`apps/portal/src/middleware.ts` if it is a bill-portal host -> push so the tunnel job rebuilds.

---

## CI/CD identity

`infra/global/main.tf`:

- `aws_iam_openid_connect_provider` for `https://token.actions.githubusercontent.com`.
- Role **`daust-github-deploy`**, trust policy restricted to
  `repo:DAUST-ORG/myDAUST:ref:refs/heads/develop` and `...:refs/heads/main`.

> **Never add a job-level `environment:` to a deploy workflow.** It changes the OIDC `sub` claim
> to `repo:DAUST-ORG/myDAUST:environment:<name>`, which no longer matches the trust policy, and
> role assumption fails. AGENTS.md §14 records that this mistake was already made and fixed once.
> Verified clean today: `grep -n '^\s*environment:' .github/workflows/*.yml` returns nothing.

Permissions granted to the deploy role — deliberately narrow:

| Statement | Grants |
| --- | --- |
| `EcrAuth` | `ecr:GetAuthorizationToken` |
| `EcrPush` | layer upload/`PutImage`/**`BatchGetImage`** on the three `daust-*` repos. Note `ecr:DescribeImages` is **not** granted — this is why the workflow probes with `batch-get-image`; using `describe-images` would look like "image absent" and trigger a push that is guaranteed to fail against an immutable tag. |
| `EcsDeploy` | Describe/Register/UpdateService/RunTask/ListTasks |
| `PassTaskRoles` | `iam:PassRole` on `daust-staging-*` and `daust-prod-*` roles only |
| `VitrineSync` | S3 read/write/delete on the two vitrine buckets only |
| `ReadDeployLogs` | `logs:GetLogEvents` on `/ecs/daust-*` |
| `ReadRdsBackupMetadata` | `rds:DescribeDBInstances`, `rds:DescribeDBSnapshots` (the backup gate in `full-package-conversion.yml`) |

CI cannot run OpenTofu, cannot create infrastructure, and cannot read Secrets Manager. It bumps
images, rolls services, runs one-off tasks and syncs one bucket.

### Operator-only workflows

Two `workflow_dispatch` workflows are the irreversible-operations gate. Both default to dry run
and assert on a structured CloudWatch event before succeeding.

- `.github/workflows/guardian-import.yml` — guardian CSV from repo secret
  `GUARDIAN_IMPORT_CSV_B64`; SHA-256 must match the input; transported to the task as a
  hash-addressed private ECR layer.
- `.github/workflows/full-package-conversion.yml` — branch/environment lock (`develop`->staging,
  `main`->prod). A **prod** run additionally validates `backup_reference` with
  `aws rds describe-db-snapshots`, requiring `DBInstanceIdentifier == "daust-prod-pg"`,
  `Status == "available"`, `Encrypted == true`, `SnapshotType == "manual"`.

**UNVERIFIED:** `gh secret list --repo DAUST-ORG/myDAUST` returns empty for this token, and the
org-level listing is 403 (`You must be an org admin`). `GUARDIAN_IMPORT_CSV_B64` is referenced by
the workflow but its existence and scope could not be confirmed. Check with an org admin token.
