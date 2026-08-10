# Cloudflare DNS for the prod app domains.
#
# These CNAMEs were historically created out-of-band (`cloudflared tunnel route dns`).
# This brings them under OpenTofu so they survive a zone rebuild and show up in
# `tofu plan`. It is OPT-IN: with an empty cloudflare_api_token the maps below are
# empty and nothing here is planned, so existing operator runs are unaffected.
#
# Provider target: Cloudflare v4 (`cloudflare_record` + `value`, `data.cloudflare_zone`
# by name). On provider v5 these are renamed to `cloudflare_dns_record` (+ `content`)
# and `cloudflare_zones` (filter) — adjust if you bump the provider.

locals {
  cloudflare_enabled = var.cloudflare_api_token != ""

  # Prod cloudflared tunnel (see infra/tunnel-prod/config.yml). A proxied CNAME to this
  # target routes the hostname through the tunnel to the prod ALB.
  prod_tunnel_target = "1510130a-e77f-486c-96af-52d4618350fb.cfargotunnel.com"

  # daust.net hostnames served by the prod tunnel, keyed for a stable for_each address.
  # `mydaust` is the new record OpenTofu creates. To also manage the pre-existing records
  # (my / payment / root), uncomment them AND import each first so apply adopts rather than
  # recreates — e.g.:
  #   tofu import 'cloudflare_record.tunnel["my"]' <zone_id>/<record_id>
  tunnel_hosts = local.cloudflare_enabled ? {
    mydaust = "mydaust" # mydaust.daust.net — new primary app alias
    # my      = "my"      # my.daust.net
    # payment = "payment" # payment.daust.net
    # root    = "@"       # daust.net (vitrine)
  } : {}
}

data "cloudflare_zone" "daust_net" {
  count = local.cloudflare_enabled ? 1 : 0
  name  = "daust.net"
}

resource "cloudflare_record" "tunnel" {
  # The map keys and values are fixed public hostnames. The condition inherits
  # sensitivity from the API token, so explicitly remove it for for_each.
  for_each = nonsensitive(local.tunnel_hosts)

  zone_id = data.cloudflare_zone.daust_net[0].id
  name    = each.value
  type    = "CNAME"
  value   = local.prod_tunnel_target
  proxied = true
  ttl     = 1 # 1 = "automatic"; required by Cloudflare when proxied
  comment = "App domain via prod cloudflared tunnel (OpenTofu-managed)"
}

output "cloudflare_app_hostnames" {
  description = "App hostnames OpenTofu manages on the daust.net zone."
  value       = [for r in cloudflare_record.tunnel : r.hostname]
}
