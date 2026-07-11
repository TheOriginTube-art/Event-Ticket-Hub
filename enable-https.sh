#!/usr/bin/env bash
# Obtains a free Let's Encrypt SSL certificate for your domain and switches
# nginx to serve the site over https.
#
# Usage: ./enable-https.sh your-domain.com
#
# Before running this:
#   1. Your domain's DNS A record must already point at this server's IP.
#   2. The site must already be running via `docker compose up -d --build`.

set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: ./enable-https.sh your-domain.com"
  exit 1
fi

echo "Requesting a certificate for $DOMAIN..."
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --register-unsafely-without-email \
  --agree-tos \
  --non-interactive

echo "Certificate obtained. Switching nginx to https..."
sed "s/__DOMAIN__/$DOMAIN/g" nginx-ssl.conf.template > nginx.conf

docker compose up -d
docker compose restart web

echo ""
echo "Done! Your site should now be available at https://$DOMAIN"
echo "The certificate is valid for 90 days. Renew it later by running:"
echo "  docker compose run --rm --entrypoint certbot certbot renew"
echo "  docker compose restart web"
