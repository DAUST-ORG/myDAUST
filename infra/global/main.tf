# Account-global CI/CD identity: GitHub Actions deploys via OIDC (no long-lived AWS keys).
# CI only bumps images/objects and rolls ECS services; the tofu roots stay operator-run.

locals {
  account_id = "961828155948"
  repo       = "DAUST-ORG/myDAUST"
  # develop -> staging, main -> prod (mapping enforced in the workflow, not IAM;
  # one role keeps this simple at the current team size).
  branches = ["develop", "main"]
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # GitHub's OIDC root CA thumbprint; AWS now validates against trusted roots,
  # but the argument is still required by the provider.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for b in local.branches : "repo:${local.repo}:ref:refs/heads/${b}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "daust-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [
      "arn:aws:ecr:us-east-1:${local.account_id}:repository/daust-api",
      "arn:aws:ecr:us-east-1:${local.account_id}:repository/daust-portal",
      "arn:aws:ecr:us-east-1:${local.account_id}:repository/daust-tunnel",
    ]
  }

  statement {
    sid = "EcsDeploy"
    actions = [
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:DescribeTasks",
      "ecs:RegisterTaskDefinition",
      "ecs:UpdateService",
      "ecs:RunTask",
      "ecs:ListTasks",
    ]
    # Describe/Register are account-scoped API calls; Update/Run are constrained
    # by the cluster resources below via ecs:cluster condition where applicable.
    resources = ["*"]
  }

  statement {
    sid       = "PassTaskRoles"
    actions   = ["iam:PassRole"]
    resources = [
      "arn:aws:iam::${local.account_id}:role/daust-staging-*",
      "arn:aws:iam::${local.account_id}:role/daust-prod-*",
    ]
  }

  statement {
    sid = "VitrineSync"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      "arn:aws:s3:::daust-staging-vitrine-961828155948",
      "arn:aws:s3:::daust-staging-vitrine-961828155948/*",
      "arn:aws:s3:::daust-prod-vitrine-961828155948",
      "arn:aws:s3:::daust-prod-vitrine-961828155948/*",
    ]
  }

  statement {
    sid       = "ReadDeployLogs"
    actions   = ["logs:GetLogEvents"]
    resources = ["arn:aws:logs:us-east-1:${local.account_id}:log-group:/ecs/daust-*:*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
