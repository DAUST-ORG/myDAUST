# myDAUST deployment

Everything needed to stand this system up from nothing, and to operate the one that is
already running. Written 2026-08-24 against `origin/main` at `9d1f14c`.

Every claim below carries the file path or command that proves it. Anything that could not be
proven from this machine is marked **UNVERIFIED**.

Companion pages:

| Page | Contents |
| --- | --- |
| [`infrastructure.md`](infrastructure.md) | AWS + Cloudflare resources, terraform roots, state backend, apply procedure |
| [`database.md`](database.md) | RDS, migrations, bootstrapping a brand-new database, backup/restore |
| [`environment.md`](environment.md) | Every environment variable, where it is set, what is unset in prod |

Read [`../AGENTS.md`](../AGENTS.md) before changing any code this document deploys. It is the
repository's source of truth for architecture and invariants.

---

## 1. The images currently running in production

Production account **961828155948**, region **us-east-1**, registry
`961828155948.dkr.ecr.us-east-1.amazonaws.com`.

Last successful production deploy: GitHub Actions **run 32514030565**, `main` @
`9d1f14c72c86b84b0522b48b5b2b388fa03f07b2`, 2026-08-21T18:34:19Z, conclusion `success`
(`gh run view 32514030565 --repo DAUST-ORG/myDAUST`). That SHA is the current tip of
`origin/main`.

| Image | Full URI (copy-pasteable) | Tag | Digest | ECS task definition | Purpose | Built from |
| --- | --- | --- | --- | --- | --- | --- |
| `daust-api` | `961828155948.dkr.ecr.us-east-1.amazonaws.com/daust-api:9d1f14c-main` | `9d1f14c-main` | `sha256:081430c340f630ca5b63d5705fc3840d6bf2f31a876f0787f14aa3aa00ad48da` | `daust-prod-api:139` | NestJS API on :4000, and the image every one-off migration / data task runs from | `9d1f14c72c86b84b0522b48b5b2b388fa03f07b2` |
| `daust-portal` | `961828155948.dkr.ecr.us-east-1.amazonaws.com/daust-portal:9d1f14c-main` | `9d1f14c-main` | `sha256:ceef4dc4c07ef66a2331949b5ac5add32495c151fa00b7d20743fe555ce5bb7e` | `daust-prod-portal:71` | Next.js standalone portal on :3000 (all authenticated UI + the public bill portal) | `9d1f14c72c86b84b0522b48b5b2b388fa03f07b2` |
| `daust-tunnel` | `961828155948.dkr.ecr.us-east-1.amazonaws.com/daust-tunnel:9e7214c-main` | `9e7214c-main` | `sha256:9a27bcbecd06cca214014852f1dbcb9fc28303fed8f15785b4d2828e145fe1d6` | `daust-prod-tunnel:6` | `cloudflared` connector; terminates every public hostname and forwards to the ALB / vitrine bucket | `9e7214c72a0753e84af27e3a34d0165ef04b0d0b` |

**The vitrine has no image.** It is a static Next.js export synced to
`s3://daust-prod-vitrine-961828155948/` by the `vitrine` job of the same run
(`.github/workflows/deploy.yml`, job `vitrine`). Its "version" is the git SHA of the run that
last synced it — `9d1f14c` as of run 32514030565.

### How these were established

- Tags: `TAG="${GITHUB_SHA::7}-${GITHUB_REF_NAME}"` — `.github/workflows/deploy.yml`, step
  *Build and push images*.
- Digests: the `docker push` output lines in run 32514030565's log, e.g.
  `9d1f14c-main: digest: sha256:081430c3... size: 2206`.
- Task definitions: the run log lines
  `api -> arn:aws:ecs:us-east-1:961828155948:task-definition/daust-prod-api:139` and
  `portal -> ...:task-definition/daust-prod-portal:71`.
- The tunnel job was **skipped** in run 32514030565 (its path filter covers only
  `infra/tunnel/**`, `infra/tunnel-prod/**` and `deploy.yml`). Its last successful run on `main`
  is **32269262653** (2026-08-19), which produced `daust-tunnel:9e7214c-main` and
  `daust-prod-tunnel:6`.

Reproduce any of this with:

```sh
gh run list --workflow=Deploy --branch=main --limit 10 \
  --json databaseId,status,conclusion,headSha,createdAt
gh run view 32514030565 --repo DAUST-ORG/myDAUST --log \
  | grep -aE 'digest:|api -> arn|portal -> arn'
```

### UNVERIFIED: not confirmed against live AWS

The AWS CLI on this machine is authenticated as
`arn:aws:iam::215156970618:user/sm_mbp_cli` — **a different account from the production account
961828155948**:

```
$ aws sts get-caller-identity
{"Account": "215156970618", "Arn": "arn:aws:iam::215156970618:user/sm_mbp_cli"}

$ aws ecr describe-images --registry-id 961828155948 --repository-name daust-api
AccessDeniedException: User: arn:aws:iam::215156970618:user/sm_mbp_cli is not authorized ...

$ aws ecs describe-services --cluster daust-prod --services daust-prod-api
ClusterNotFoundException: Cluster not found.
```

So the table above is derived from the deploy workflow and its run logs, not from
`ecr describe-images` / `ecs describe-services`. The digests are real (they are ECR's own
response to the push), but **nothing here proves no one changed the service by hand since
2026-08-21**. To confirm, from a session with credentials in account 961828155948:

```sh
aws ecs describe-services --cluster daust-prod \
  --services daust-prod-api daust-prod-portal daust-prod-tunnel \
  --query 'services[].{name:serviceName,td:taskDefinition,running:runningCount,desired:desiredCount}'

aws ecs describe-task-definition --task-definition daust-prod-api:139 \
  --query 'taskDefinition.containerDefinitions[0].image'

aws ecr describe-images --repository-name daust-api --image-ids imageTag=9d1f14c-main \
  --query 'imageDetails[0].imageDigest'
```

---

## 2. Runbook: first-time setup from zero

This is the full path from an empty AWS account to a serving system. Nothing here has been
executed by this document — it is read out of `infra/`, `.github/workflows/deploy.yml` and
`packages/db/prisma/`. Details and exact resource definitions are in
[`infrastructure.md`](infrastructure.md) and [`database.md`](database.md).

Prerequisites: OpenTofu >= 1.8, AWS credentials for the target account, Docker with `linux/arm64`
support, Node 20+ (CI uses 24), pnpm 10.23.0, a Cloudflare account holding the public zone.

1. **State bucket.** `cd infra/bootstrap && tofu init && tofu apply`. Local state, run once.
   Creates `daust-tfstate-961828155948` (versioned, AES256, TLS-only bucket policy).
   `infra/bootstrap/main.tf`.
2. **CI identity.** `cd infra/global && tofu init && tofu apply`. Creates the GitHub OIDC
   provider and the `daust-github-deploy` role. `infra/global/main.tf`.
3. **ECR repositories.** *These live in the `staging` root only* —
   `infra/environments/staging/main.tf:8` instantiates `modules/ecr` with
   `repos = ["api", "portal", "tunnel"]`; the prod root does not. Both environments share those
   three repositories. Apply staging (step 4) before expecting prod images to have anywhere to go.
4. **Staging environment.** `cd infra/environments/staging`, export the TF_VAR values listed in
   [`infrastructure.md`](infrastructure.md#applying), `tofu init && tofu apply`.
5. **Build and push the first images** (there is a chicken-and-egg: ECS cannot pull until an
   image exists). `infra/README.md` §3 has the manual commands; use `--platform linux/arm64`,
   because every task definition sets `cpu_architecture = "ARM64"`
   (`infra/modules/ecs-service/main.tf`).
6. **Production environment.** `cd infra/environments/prod`, same procedure. `api_image` and
   `portal_image` are required variables; `tunnel_creds` + `tunnel_image` are optional and the
   tunnel service is `count = 0` until both are non-empty.
7. **Database.** Migrate, then bootstrap, then create staff logins — full procedure in
   [`database.md`](database.md#bootstrapping-a-brand-new-database). In short:
   `prisma migrate deploy` → `bootstrap-prod.ts` (refuses to run on a non-empty DB) →
   `prod-accounts.ts` with passwords supplied via env vars.
8. **Cloudflare tunnel.** Create the tunnel, put its credentials JSON into
   `TF_VAR_tunnel_creds`, put the tunnel id and ALB hostname into `infra/tunnel-prod/config.yml`,
   build and push `daust-tunnel`, re-apply. Then add a **proxied** CNAME per hostname pointing at
   `<tunnel-id>.cfargotunnel.com`.
9. **Wire GitHub.** The deploy workflow needs nothing but OIDC; the account id, region, role ARN
   and registry are hardcoded in `.github/workflows/deploy.yml`'s `env:` block. Change them there
   for a different account.

There is no single "stand it all up" script. If you want one, that is the gap.

---

## 3. Runbook: routine deploy

**Branch model** (`.github/workflows/deploy.yml`, `on.push.branches`; AGENTS.md §14):

```
feature branch  (serigne/<topic> | codex/<topic>)
      |  PR
      v
   develop  ---->  deploys STAGING  (daust-staging.azt.dev, daust.azt.dev)
      |  PR ("release:" / "promote ..." )
      v
    main   ---->  deploys PRODUCTION (my.daust.net, payment.daust.net, daust.net)
```

**Merging to `main` deploys production and runs migrations against the live database with no
approval gate.** Confirmed two ways: the workflow triggers on `push` to `main` with no
`environment:` key on any job, and `gh api repos/DAUST-ORG/myDAUST/environments` returns exactly
one environment, `staging`, with `"protection_rules": []`. There is no prod environment and
therefore no reviewer gate anywhere in the pipeline.

**What a deploy actually does** — five ordered steps in the `app` job, API before portal on
purpose:

1. Build + push `daust-api` and `daust-portal` tagged `<sha7>-<branch>`. If both tags already
   exist in ECR (probed with `batch-get-image`, the only ECR read the deploy role is granted),
   the build is skipped and the existing artifact is promoted.
2. `prisma migrate deploy` as a one-off Fargate task **on a task definition carrying the newly
   built image**. Running the current task def would silently skip new migrations and the API
   would then 500 on the new columns. Non-zero exit fails the deploy.
3. `load-sis-reference.ts` on that same task def — official grading scales, catalogue years,
   degree requirements, fee schedule. Idempotent, and it asserts that no student, invoice or
   payment row count changed.
4. Roll `daust-prod-api`, then `aws ecs wait services-stable` (which only returns once the new
   tasks pass ALB health checks), then a best-effort `GET $API_ORIGIN/api/health` edge check.
5. `reconcile-installment-statuses.cli.js` as a one-off task. The workflow polls CloudWatch for a
   structured `{"event":"installment-status-reconciliation","ok":true,...}` line and **fails the
   deploy if it never appears**. Only then does the portal roll.

**Watching a deploy:**

```sh
gh run watch --repo DAUST-ORG/myDAUST                       # live
gh run list --workflow=Deploy --branch=main --limit 5 \
  --json databaseId,status,conclusion,headSha,createdAt
gh run view <id> --repo DAUST-ORG/myDAUST --log \
  | grep -aE 'digest:|migration exit code|reference-data exit code|edge health|reconciliation|api -> |portal -> '
```

A healthy run prints, in order: two `digest:` lines, `migration exit code: 0`,
`reference-data exit code: 0`, `edge health OK (https://my.daust.net)`,
`{"event":"installment-status-reconciliation","ok":true,"changedCount":N}`, `api -> ...:N`,
`portal -> ...:M`. That is exactly what run 32514030565 printed.

**Verifying afterwards:**

```sh
curl -sf https://my.daust.net/api/health          # expect {"ok":true,...}
curl -sfI https://payment.daust.net/              # portal middleware rewrites / -> /pay-bill
curl -sfI https://daust.net/                      # vitrine (S3 via the tunnel)
aws ecs describe-services --cluster daust-prod \
  --services daust-prod-api daust-prod-portal \
  --query 'services[].{n:serviceName,td:taskDefinition,run:runningCount}'
```

**The path filter can surprise you.** The `app` job only runs when `apps/api/**`,
`apps/portal/**`, `packages/**`, `pnpm-lock.yaml` or `deploy.yml` changed. `vitrine` runs on
`apps/vitrine/**` or `packages/shared/**`. `tunnel` runs on `infra/tunnel*/**` or `deploy.yml`.
A docs-only merge to `main` deploys nothing. Use **workflow_dispatch** to force every job.

---

## 4. Runbook: rollback

There is no rollback button. Rolling back means pointing the ECS service at an older image tag.

**Before you do it, decide about the database.** Step 2 of every deploy runs
`prisma migrate deploy`. Migrations are forward-only, hand-authored SQL with no `down` scripts
(`packages/db/prisma/migrations/`). Rolling the API image back to a build that predates a
migration puts old code on a new schema. Additive migrations are usually survivable; a migration
that dropped or renamed a column is not. Check `git diff <old-sha>..<current-sha> -- packages/db/prisma/migrations`
first.

**Roll a service back to a known tag** (requires prod-account credentials, not CI's):

```sh
CLUSTER=daust-prod
SERVICE=daust-prod-api                # or daust-prod-portal / daust-prod-tunnel
ECR=961828155948.dkr.ecr.us-east-1.amazonaws.com
TAG=<previous-sha7>-main              # e.g. 1cb21ea-main

TD=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
      --query 'services[0].taskDefinition' --output text)
aws ecs describe-task-definition --task-definition "$TD" --query 'taskDefinition' --output json \
  | jq --arg img "$ECR/daust-api:$TAG" \
       'del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy)
        | .containerDefinitions[0].image = $img' > rollback-td.json
NEW=$(aws ecs register-task-definition --cli-input-json file://rollback-td.json \
      --query 'taskDefinition.taskDefinitionArn' --output text)
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --task-definition "$NEW"
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
```

This is the same shape as the deploy workflow's *Roll API to the new image* step, so it preserves
the secrets, env and log config of the current definition and only swaps the image.

**Simpler alternative — roll back by revision.** Every past deploy left its task definition
behind. `aws ecs update-service --cluster daust-prod --service daust-prod-api --task-definition daust-prod-api:138`
restores that revision wholesale, image and env together. Enumerate with
`aws ecs list-task-definitions --family-prefix daust-prod-api --sort DESC`.

**Rollback depth is 10 images.** The ECR lifecycle policy expires anything past the most recent
10 per repository (`infra/modules/ecr/main.tf`). At roughly one deploy a day that is a
week-and-a-half of history. Older task-definition revisions survive but point at deleted images
and will fail to pull.

**Rolling back the vitrine** means re-running the `vitrine` job from the older commit
(`gh workflow run Deploy --ref <sha>` is not possible for arbitrary SHAs; check out the old tree
and re-sync manually, or revert the commit and merge). The bucket is not versioned
(`modules/static-site` sets no `aws_s3_bucket_versioning`), unlike the private buckets.

---

## 5. Runbook: "the site is down"

Work outside-in. Each layer has a distinct failure signature.

**Step 0 — which hostname?** They do not share a path:

| Host | Serves | Path |
| --- | --- | --- |
| `my.daust.net` | portal + API | Cloudflare -> tunnel -> ALB -> ECS |
| `payment.daust.net` | public bill portal | same as above; portal middleware rewrites `/` |
| `daust.net` | vitrine | Cloudflare -> tunnel -> S3 website endpoint |
| `daust.org` | **legacy WordPress**, deliberately | not this system at all |

`daust.org` showing something stale is not a bug. AGENTS.md §14: the apex still points at
WordPress on purpose, and a CMS publish cannot change it.

**Step 1 — is the app alive behind the edge?**

```sh
curl -sf https://my.daust.net/api/health
```

`{"ok":true,...}` means API, ALB, tunnel and DNS are all fine and the problem is narrower than
"down".

**Step 2 — Cloudflare or origin?** A Cloudflare 5xx error page (1000-range codes, "Argo Tunnel
error" / 1033) means the tunnel connector is not registered. Check the tunnel service:

```sh
aws ecs describe-services --cluster daust-prod --services daust-prod-tunnel \
  --query 'services[0].{running:runningCount,desired:desiredCount,events:events[:5]}'
aws logs tail /ecs/daust-prod-tunnel --since 30m
```

Remember the ingress map is **baked into the image** (`infra/tunnel-prod/config.yml` is `COPY`ed
in `infra/tunnel-prod/Dockerfile`). A new hostname requires a rebuilt tunnel image, not a config
change. Credentials arrive as `TUNNEL_CREDS` from Secrets Manager; a bad/rotated credential shows
as the connector failing to register at startup.

**Step 3 — ALB and tasks.**

```sh
aws ecs describe-services --cluster daust-prod --services daust-prod-api daust-prod-portal \
  --query 'services[].{n:serviceName,running:runningCount,desired:desiredCount,ev:events[:5]}'
aws logs tail /ecs/daust-prod-api --since 30m --follow
aws logs tail /ecs/daust-prod-portal --since 30m
```

`runningCount: 0` with tasks cycling is almost always one of: a bad image tag (pull failure), a
Secrets Manager value the execution role cannot read, or a boot-time env validation failure. The
API's boot validator throws a readable `Invalid environment:` block listing the offending keys
(`apps/api/src/config/env.ts`). Note that the **only** production boot assert is
`NODE_ENV=production` plus a default `SESSION_SECRET`; everything else fails at use, so a
misconfigured deploy can start healthy and break later.

**Step 4 — health-check semantics.** The API target group probes `/api/health` expecting `200`;
the portal target group probes `/login` accepting `200-399`
(`infra/modules/alb/main.tf`). A change that makes `/login` redirect outside 3xx, or that moves
`/api/health`, takes the target group down even though the app works.

**Step 5 — database.** `daust-prod-pg` is a single `db.t4g.small` instance with
`deletion_protection = true`. Reachability is SG-gated (`daust-prod-db` allows 5432 from the task
SG and from `var.admin_cidr` only). If tasks boot but every request 500s with a Prisma connection
error, check the instance and the SG:

```sh
aws rds describe-db-instances --db-instance-identifier daust-prod-pg \
  --query 'DBInstances[0].{status:DBInstanceStatus,az:AvailabilityZone,storage:AllocatedStorage}'
```

**Step 6 — capacity.** Every service runs `desired_count = 1`
(`infra/modules/ecs-service/variables.tf`, never overridden). One task each. This is deliberate:
`BillThrottleGuard` keeps its counters in per-process Maps and `@nestjs/schedule` crons run
in-process, so scaling the API out silently multiplies both rate limits and cron executions
(AGENTS.md §6, §17). Do not "fix" an overload by bumping `desired_count` without reading those.

**Step 7 — did a `tofu apply` do this?** `aws_ecs_service` has no
`lifecycle { ignore_changes = [task_definition] }` (`infra/modules/ecs-service/main.tf`), so an
operator apply resets both services to whatever `var.api_image` / `var.portal_image` said and
drops the env vars deploy.yml injects (`TRANSCRIPT_IMPORT_BUCKET`, `VITRINE_ORIGIN`,
`ADDITIONAL_CORS_ORIGINS`). Symptom: the site comes back on an old build, or CORS starts
rejecting `daust.net`. Fix: re-run the deploy workflow, or apply again passing the
currently-running tags.
