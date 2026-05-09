#!/bin/bash
# EmeraldFi Server Setup Script
# Jalankan dengan: sudo bash setup-server.sh

set -e
DOMAIN="emeraldfinance.fun"
APP_USER="indra"
APP_PORT="3000"

echo "=== EmeraldFi Server Setup ==="
echo "Domain: $DOMAIN"
echo ""

# 1. PM2 auto-start on reboot
echo "[1/4] Registering PM2 with systemd..."
env PATH=$PATH:/home/indra/.nvm/versions/node/v22.22.2/bin \
  /home/indra/.nvm/versions/node/v22.22.2/lib/node_modules/pm2/bin/pm2 \
  startup systemd -u $APP_USER --hp /home/$APP_USER
su - $APP_USER -c "pm2 save"
echo "✓ PM2 startup registered"

# 2. Install NGINX + Certbot
echo "[2/4] Installing NGINX dan Certbot..."
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx
echo "✓ NGINX dan Certbot installed"

# 3. Configure NGINX (HTTP dulu, certbot akan upgrade ke HTTPS)
echo "[3/4] Configuring NGINX..."
cat > /etc/nginx/sites-available/emfi << NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/emfi /etc/nginx/sites-enabled/emfi
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx && systemctl enable nginx
echo "✓ NGINX configured"

# 4. SSL Certificate via Let's Encrypt
echo "[4/4] Getting SSL certificate..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN \
  --non-interactive --agree-tos \
  --email admin@$DOMAIN \
  --redirect
echo "✓ SSL certificate installed"

# 5. Register Telegram Webhook
echo ""
echo "[5/5] Registering Telegram webhook..."
source /home/$APP_USER/projects/apps/emfi/.env
RESULT=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${TELEGRAM_WEBHOOK_URL}" \
  -d "secret_token=${TELEGRAM_SECRET_TOKEN}")
echo "Webhook result: $RESULT"

# Restart app to pick up new env
su - $APP_USER -c "pm2 restart emfi-3000 --update-env"

echo ""
echo "=== Setup Complete ==="
echo "✓ Website : https://$DOMAIN"
echo "✓ API Docs: https://$DOMAIN/docs"
echo "✓ Health  : https://$DOMAIN/health"
echo "✓ Telegram: @EmeraldFinancesol_bot"
