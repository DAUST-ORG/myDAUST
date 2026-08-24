# Environment variables and secrets

Every variable this system reads, where production sets it, and what breaks when it is missing.

Sources, all read on 2026-08-24:
`apps/api/src/config/env.ts` (the only validated schema), a repo-wide `process.env` sweep,
`.env.example`, `infra/environments/prod/main.tf`, `infra/environments/prod/variables.tf`,
`.github/workflows/deploy.yml`, and the two Dockerfiles.

**No values appear here.** Where a value is a secret, the Secrets Manager path is named instead.

---

## 1. Start here: what is unset in production

These are not theoretical. Each was checked against `infra/environments/prod/main.tf` and the jq
map in `.github/workflows/deploy.yml`.

### `PUBLIC_URL` — UNSET. Every account-setup email link points at `localhost`.

`PUBLIC_URL` is **not** in the zod schema (`apps/api/src/config/env.ts`), so nothing validates it
and the API boots happily without it. It is read directly in two places, both with the same
fallback:

- `apps/api/src/registrar/registrar.service.ts:226`
- `apps/api/src/guardians/guardians.service.ts:543`

```ts
const origin = process.env.PUBLIC_URL ?? "http://localhost:3000";
const link = `${origin}/set-password?token=${token}`;
```

It appears nowhere in `infra/environments/prod/main.tf` and nowhere in deploy.yml's env-injection
map. **Consequence:** every student password-setup email and every guardian invite email built in
production contains `http://localhost:3000/set-password?token=...` — a dead link. The token is
valid; the URL is not. `apps/api/src/users/users.service.ts:195` documents this as a known state
and works around it by having the registrar hand out temporary passwords instead of relying on
the emailed link.

**Fix:** add `{ name = "PUBLIC_URL", value = local.public_url }` to the api service's
`environment` list in `infra/environments/prod/main.tf` (`local.public_url` is already
`https://my.daust.net`). Because an operator apply rewrites the task definition anyway, that is
the right home for it. Adding it to the deploy.yml jq map as well would keep it surviving both
paths, at the cost of one more duplicated constant.

### `RESEND_API_KEY` — UNSET. No transactional email is actually sent.

Conditional on both sides. Terraform only creates the secret and only wires it when the variable
is non-empty:

```hcl
var.resend_api_key != "" ? { RESEND_API_KEY = var.resend_api_key } : {}
```

And `apps/api/src/mail/mail.service.ts:21-33` degrades silently:

```ts
private readonly apiKey = process.env.RESEND_API_KEY;
...
if (!this.apiKey) {
  this.logger.log(`[dev-mail] to=${toLabel} subject="${msg.subject}" (no RESEND_API_KEY — not sent)`);
  return { sent: false };
}
```

**Consequence:** guardian invites, student account-setup mails, and every other transactional
message are written to `/ecs/daust-prod-api` in CloudWatch and nothing leaves the building. The
call returns `{ sent: false }`, so callers that check it behave correctly — but nobody receives
anything.

**UNVERIFIED:** whether `TF_VAR_resend_api_key` was passed on the last operator apply. The
repository cannot tell you; the secret's existence can:
`aws secretsmanager describe-secret --secret-id daust-prod/RESEND_API_KEY` (a
`ResourceNotFoundException` means it was never set). Note also that `PUBLIC_URL` being unset means
even a working Resend key would send links to `localhost` — fix both together.

### `PI_SPI_*` — all eleven UNSET. The BCEAO instant-payment rail is dark.

`grep -rn "PI_SPI" infra .github` returns nothing. The schema defaults `PI_SPI_ENABLED` to
`"false"` and marks every credential optional, so the provider reports itself unconfigured and the
method stays hidden from payers rather than failing at checkout. The mTLS client certificate
(issued through the PICERT portal) is the standing go-live blocker.

### `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `POSTHOG_KEY`, `POSTHOG_HOST` — present in `.env.example`, wired to nothing.

There is no error tracking and no analytics in the codebase (AGENTS.md §14). Setting them changes
nothing.

### `.env.example` disagrees with production in two places

| Key | `.env.example` | Production reality |
| --- | --- | --- |
| `MAIL_FROM` | `myDAUST <no-reply@daust.org>` | `myDAUST <no-reply@updates.daust.net>` (`environments/prod/main.tf`) |
| `NEXT_PUBLIC_API_URL` | `https://api.daust.net` | `""` (empty string, same-origin) — see §4 |

`api.daust.net` is not a hostname this stack serves. Do not copy that line into a real build.

---

## 2. API runtime — validated by `apps/api/src/config/env.ts`

These pass through zod at boot. A violation throws `Invalid environment:` with the offending keys
listed, and the task exits before Nest starts.

| Variable | Type / default | Set in prod | Where | Required |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | enum `development` \| `test` \| `production`, default `development` | `production` | task env (`main.tf`) **and** `ENV` in `apps/api/Dockerfile` | effectively yes |
| `PORT` | number, default `4000` | `4000` | task env + Dockerfile | no |
| `DATABASE_URL` | **url, no default** | yes | secret `daust-prod/DATABASE_URL` | **yes** |
| `PORTAL_ORIGIN` | url, default `http://localhost:3000` | `https://my.daust.net` | task env (`local.public_url`) | no, but CORS breaks without it |
| `VITRINE_ORIGIN` | url, default `http://localhost:3001` | `https://daust.org` | task env **and** re-injected by deploy.yml | no |
| `ADDITIONAL_CORS_ORIGINS` | comma-separated urls, default `""` | `https://daust.net,https://www.daust.org,https://mydaust.daust.org,https://payment.daust.org` | task env **and** re-injected by deploy.yml | no |
| `PAYMENT_ORIGIN` | url, default `http://localhost:3000` | `https://payment.daust.net` | task env (`local.payment_url`) | no |
| `WIRE_PROOFS_BUCKET` | string >= 3, optional | `daust-prod-wire-proofs-961828155948` | task env | no (fails at use) |
| `MEDIA_BUCKET` | string >= 3, optional | `daust-prod-media-961828155948` | task env | no (fails at use) |
| `AWS_REGION` | string >= 3, default `us-east-1` | **not set** — the default applies | — | no |
| `SESSION_SECRET` | string >= 16, default `dev-only-session-secret-change-me` | yes | secret `daust-prod/SESSION_SECRET` | **yes in production** |
| `COOKIE_SECURE` | enum `true` \| `false`, optional | `true` | task env | yes in practice |
| `PI_SPI_ENABLED` | enum, default `false` | unset | — | no |
| `PI_SPI_BASE_URL` | url, default `https://sandbox.api.pi-bceao.com/piz/v1` | unset | — | no |
| `PI_SPI_TOKEN_URL` | url, optional | unset | — | no |
| `PI_SPI_CLIENT_ID` | string, optional | unset | — | no |
| `PI_SPI_CLIENT_SECRET` | string, optional | unset | — | no |
| `PI_SPI_API_KEY` | string, optional | unset | — | no |
| `PI_SPI_PAYE_ALIAS` | uuid, optional | unset | — | no |
| `PI_SPI_WEBHOOK_SECRET` | string, optional | unset | — | no |
| `PI_SPI_CLIENT_CERT` | PEM string, optional | unset | — | no |
| `PI_SPI_CLIENT_KEY` | PEM string, optional | unset | — | no |
| `PI_SPI_REQUEST_TTL_HOURS` | int 1..720, default `72` | unset | — | no |

### The only production boot assert

```ts
if (env.NODE_ENV === "production" && env.SESSION_SECRET === "dev-only-session-secret-change-me") {
  ctx.addIssue({ ... "SESSION_SECRET must be set to a real secret in production" });
}
```

That is it. Everything else — PI-SPI credentials, bucket names, mail keys — fails at *use*, not at
boot. **A misconfigured production deploy starts healthy, passes the ALB health check, passes the
edge health check, and breaks the first time someone tries the affected feature.** Do not read a
green deploy as proof of correct configuration.

### `COOKIE_SECURE` is explicit for a reason

There is no TLS at the ALB — Cloudflare terminates at the edge and the tunnel forwards plain HTTP,
so the app sees an insecure request and cannot infer that the browser is on https. The value is
hardcoded `"true"` in `infra/environments/prod/main.tf`. Removing it silently issues non-secure
session cookies.

### CORS is an allowlist assembled from four variables

`apps/api/src/main.ts` builds the origin list as
`[PORTAL_ORIGIN, VITRINE_ORIGIN, PAYMENT_ORIGIN, ...ADDITIONAL_CORS_ORIGINS]`, deduped, with
`credentials: true` and an explicit `allowedHeaders` allowlist
(`Content-Type`, `Authorization`, `sentry-trace`, `baggage`). Two consequences:

- A new public hostname must be added to `ADDITIONAL_CORS_ORIGINS` **in both**
  `infra/environments/prod/main.tf` and the jq map in deploy.yml, or one deploy path will drop it.
- A new custom request header is blocked at preflight until it is added to `allowedHeaders`.

---

## 3. API runtime — read directly, never validated

These bypass the zod schema entirely. They have no boot check and no error if missing.

| Variable | Read at | Prod value | Effect when unset |
| --- | --- | --- | --- |
| `PUBLIC_URL` | `registrar.service.ts:226`, `guardians.service.ts:543` | **unset** | invite links point at `http://localhost:3000` — see §1 |
| `RESEND_API_KEY` | `mail/mail.service.ts:21` | **unset** (conditional secret) | emails logged, never sent — see §1 |
| `MAIL_FROM` | `mail/mail.service.ts:23` | `myDAUST <no-reply@updates.daust.net>` (task env) | falls back to the same literal |
| `TRANSCRIPT_IMPORT_BUCKET` | `transcript/historical-import.cli.ts:18` (its own zod schema, `min(3)`) | `daust-prod-transcript-imports-961828155948` — set in `main.tf` **and** re-injected by deploy.yml | the historical transcript importer throws `TRANSCRIPT_IMPORT_BUCKET is not configured`; the API itself is unaffected |

---

## 4. Portal (`apps/portal`)

| Variable | When | Prod value | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | **build time** | `""` (empty string) | `ARG NEXT_PUBLIC_API_URL=""` in `apps/portal/Dockerfile`; deploy.yml passes `--build-arg NEXT_PUBLIC_API_URL=""` |
| `NODE_ENV` | runtime | `production` | Dockerfile `ENV` |
| `HOSTNAME` | runtime | `0.0.0.0` | Dockerfile `ENV` and task env |
| `PORT` | runtime | `3000` | Dockerfile `ENV` and task env |

The portal task carries **no secrets at all** — `module "portal_service"` passes no `secrets`
block. All privileged work goes through the API.

> ### The `??` in `lib/api.ts` is load-bearing
>
> ```ts
> const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
> ```
> (`apps/portal/src/lib/api.ts:43`, and identically in
> `apps/portal/src/components/ProofPaymentPanel.tsx:14`.)
>
> Production builds pass an **empty string**, which is not nullish, so `API_URL` becomes `""` and
> every call is same-origin — which is what makes the ALB's `/api/*` listener rule work. Changing
> `??` to `||` would inline `http://localhost:4000` into the production bundle and break every
> request. This is a real trap: `||` looks like a harmless modernisation.

Because `NEXT_PUBLIC_*` is inlined into client chunks at build time, changing it requires an image
rebuild. It cannot be fixed by editing a task definition.

---

## 5. Vitrine (`apps/vitrine`) — build time only

Static export; there is no vitrine server and no vitrine container. `next.config.mjs` re-exports
both with localhost fallbacks; deploy.yml's `vitrine` job sets them from `$API_ORIGIN`:

| Variable | Prod value | Staging value |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://my.daust.net` | `https://daust-staging.azt.dev` |
| `NEXT_PUBLIC_PORTAL_URL` | `https://my.daust.net` | `https://daust-staging.azt.dev` |

Unlike the portal, the vitrine gets an **absolute** API URL, because it is served from a different
origin (`daust.net`) than the API. That is exactly why `daust.net` must appear in
`ADDITIONAL_CORS_ORIGINS`.

---

## 6. Operator / CLI variables

Not part of the running services. Read by scripts under `packages/db/prisma/` and
`apps/api/src/**/*.cli.ts`, usually via a container override on a one-off ECS task.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `CONFIRM` | every bulk importer | `1` = actually write. Default is dry run. **Never set this on your own initiative** (AGENTS.md §17). |
| `SEED_ALLOW_PROD` | `seed.ts:10` | overrides the refusal to demo-seed a `daust-prod` database. Don't. |
| `TARGET_ENV` | `normalize-staging-legacy-demo.ts` | must equal `staging` or the script throws |
| `ADMIN_PASSWORD`, `REGISTRAR_PASSWORD`, `BURSAR_PASSWORD`, `HR_PASSWORD`, `IT_PASSWORD`, `COMMS_PASSWORD`, `FACULTY_PASSWORD` | `prod-accounts.ts` | one per staff account; omitting one skips that account; each must be >= 12 chars. See [`database.md`](database.md#prod-accountsts). |
| `GUARDIANS_CSV`, `GUARDIANS_S3_BUCKET`, `GUARDIANS_S3_KEY`, `IMPORT_ACTOR_EMAIL`, `ALLOW_PARTIAL` | `import-guardians.ts` / `guardian-import.yml` | guardian import source and provenance |
| `STUDENTS_CSV` | `import-students.ts` | legacy cohort import source |
| `LEGACY_COHORT_IMPORT_PLAN_SHA256` | `apps/api/src/admissions/legacy-cohort-import.cli.ts` | required whenever `CONFIRM=1`; a digest copied from a clean dry run that anchors live DB state, so any drift invalidates the run |
| `PHOTOS_DIR`, `PHOTO_BASE_URL` | `attach-photos.ts` | student photo attachment |
| `ACADEMIC_YEAR` | reference/import scripts | target academic year |
| `BACKUP_REFERENCE` | `full-package-conversion.yml` | RDS snapshot id; validated to be manual + encrypted + available + from `daust-prod-pg` |
| `TEST_DATABASE_URL` | ~31 integration suites | falls back to `DATABASE_URL`. **CI sets neither, so every database-backed test skips on every PR** (AGENTS.md §13). `legacy-cohort-import.integration.test.ts` reads only this one, with no fallback. |

---

## 7. Terraform variables

`infra/environments/prod/variables.tf`. Pass as `TF_VAR_*` environment variables at plan/apply
time; `staging.auto.tfvars.example` explains why, and never write a real `.tfvars` file.

| Variable | Required | Sensitive | Purpose |
| --- | --- | --- | --- |
| `session_secret` | **yes** | yes | becomes secret `daust-prod/SESSION_SECRET` |
| `admin_cidr` | **yes** | no | single-host `/32` allowed to reach RDS on 5432. Validated — a non-`/32` fails plan. |
| `api_image` | **yes** | no | ECR URI + tag. **Pass the currently-running tag** or apply rolls production back. |
| `portal_image` | **yes** | no | same |
| `resend_api_key` | no (default `""`) | yes | empty = the secret is not created and the env var is not wired |
| `tunnel_creds` | no (default `""`) | yes | cloudflared credentials JSON; empty = the tunnel service is `count = 0` |
| `tunnel_image` | no (default `""`) | no | empty = the tunnel service is `count = 0` |
| `cloudflare_api_token` | no (default `""`) | yes | DNS:Edit on the `daust.net` zone; empty leaves DNS unmanaged (`dns.tf`) |

Note the provider block substitutes a syntactically valid dummy token when
`cloudflare_api_token` is empty, because the Cloudflare v4 provider demands one even with zero
managed resources. That dummy is never used for a request.

---

## 8. GitHub Actions

`.github/workflows/deploy.yml` `env:` block — all hardcoded, no repository variables:

| Key | Value |
| --- | --- |
| `AWS_REGION` | `us-east-1` |
| `ECR` | `961828155948.dkr.ecr.us-east-1.amazonaws.com` |
| `ROLE_ARN` | `arn:aws:iam::961828155948:role/daust-github-deploy` |
| `ENV_NAME` | `main` -> `prod`, otherwise `staging` |
| `API_ORIGIN` | `main` -> `https://my.daust.net`, otherwise `https://daust-staging.azt.dev` |

Credentials come from OIDC (`permissions: id-token: write`). There are no long-lived AWS keys in
GitHub.

Referenced repository secret: `GUARDIAN_IMPORT_CSV_B64` (`guardian-import.yml:54`).
**UNVERIFIED** — `gh secret list --repo DAUST-ORG/myDAUST` returned nothing for this token and the
org listing is 403 (`You must be an org admin`). Confirm with an org admin.

`gh api repos/DAUST-ORG/myDAUST/environments` returns exactly one environment, `staging`, with
`"protection_rules": []`. **There is no production environment and therefore no approval gate.**

---

## 9. Where secrets live, by name

Never a value — only the location.

| Secret | Store | Path / name |
| --- | --- | --- |
| Database connection string | AWS Secrets Manager (us-east-1, acct 961828155948) | `daust-prod/DATABASE_URL` |
| Session signing secret | AWS Secrets Manager | `daust-prod/SESSION_SECRET` |
| Resend API key | AWS Secrets Manager | `daust-prod/RESEND_API_KEY` (only exists if `TF_VAR_resend_api_key` was set) |
| Cloudflare tunnel credentials | AWS Secrets Manager | `daust-prod/TUNNEL_CREDS` |
| RDS master password | generated by terraform; also inside `DATABASE_URL` | `tofu output -raw db_password` in `infra/environments/prod` |
| Terraform state (contains all of the above in plaintext) | S3 | `s3://daust-tfstate-961828155948/prod/terraform.tfstate` |
| Guardian import CSV | GitHub Actions secret | `GUARDIAN_IMPORT_CSV_B64` |
| AWS deploy credentials | none — GitHub OIDC | role `daust-github-deploy` |

Staging uses the identical layout under the `daust-staging/` prefix.

Rules that follow from this:

- Read access to `daust-tfstate-961828155948` is equivalent to production database access.
- Secrets Manager entries here have `recovery_window_in_days = 0`. A delete is immediate and
  final; there is no undo window.
- If a secret is ever exposed, rotate it — do not merely remove it from wherever it leaked.
  Rotating `SESSION_SECRET` invalidates every session (7-day JWT + cookie), which is usually the
  correct outcome. Rotating `DATABASE_URL` means changing the RDS master password and updating the
  secret, then rolling `daust-prod-api`.
