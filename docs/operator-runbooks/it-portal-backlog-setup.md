# IT portal backlog — operator setup

Run these steps once per environment after the IT issues branch lands.

## 1. Verify the GitHub repo has Issues enabled

Repo → Settings → General → Features → "Issues" must be checked.
If disabled, every other step in this runbook is a no-op.

## 2. Seed the three labels

```sh
gh auth login
./scripts/seed-it-labels.sh
```

The script is idempotent: re-running does not duplicate labels.

## 3. Create the `IT` GitHub team (one-time)

Repo → Settings → Collaborators and teams → "Add people":
- Name: `IT`
- Permission: `Triage` (read access to issues, can apply labels,
  can close and reopen issues, but cannot push code)

Add the relevant team members via the org's `People` page.

## 4. Configure the portal env

In the portal container, set:

```
NEXT_PUBLIC_IT_BACKLOG_URL=https://github.com/DAUST-ORG/myDAUST/issues?q=is%3Aopen+label%3Ait-backlog
```

If unset, the portal falls back to the same default in code. Set this
explicitly if the org ever renames the repo or moves to a private
mirror.

## 5. Verify

Visit `/it/backlog` in the portal as any authenticated user. Confirm:

- The "Open the IT backlog" CTA links to the filtered issues URL.
- The three filing CTAs link to the issue chooser with the correct
  template preselected.
- The "View as student / faculty" tip is present.

## Troubleshooting

- **Filing an issue opens a 404 on github.com.** The repo does not
  have Issues enabled, or the URL is wrong. Re-check step 1.
- **The user is asked to sign in to GitHub.** Filing requires GitHub
  auth, which most students will not have. Document this in your
  onboarding materials; consider GitHub Classroom or org membership
  if student filing becomes a real need.
- **PII in an issue body is now public.** `it-backlog` is org-public.
  Train staff to scrub names and student numbers before filing.
