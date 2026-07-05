FROM cloudflare/cloudflared:2026.6.1 AS cf
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=cf /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY config.yml /etc/cloudflared/config.yml
# Tunnel credentials arrive via Secrets Manager (TUNNEL_CREDS) and never live in the image.
ENTRYPOINT ["/bin/sh","-c","umask 077 && printf '%s' \"$TUNNEL_CREDS\" > /etc/cloudflared/creds.json && exec cloudflared tunnel --no-autoupdate --config /etc/cloudflared/config.yml run"]
