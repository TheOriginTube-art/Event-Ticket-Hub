#!/bin/bash
printf 'server{\nlisten 80;\nserver_name ticketflowru.ru;\nlocation /.well-known/acme-challenge/{root /var/www/html;}\nlocation /{proxy_pass http://localhost:8080;}\n}\n' > /etc/nginx/sites-available/dps-radar
mkdir -p /var/www/html
nginx -t && systemctl reload nginx
certbot --nginx -d ticketflowru.ru
