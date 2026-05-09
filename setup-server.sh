#!/bin/bash
# EmeraldFi Server Setup Script
# Jalankan sekali dengan: bash setup-server.sh

set -e
echo "=== EmeraldFi Server Setup ==="

# 1. PM2 auto-start on reboot
echo "[1/3] Registering PM2 with systemd..."
env PATH=$PATH:/home/indra/.nvm/versions/node/v22.22.2/bin \
  /home/indra/.nvm/versions/node/v22.22.2/lib/node_modules/pm2/bin/pm2 \
  startup systemd -u indra --hp /home/indra
pm2 save
echo "✓ PM2 startup registered"

# 2. Install NGINX
echo "[2/3] Installing NGINX..."
apt-get install -y nginx certbot python3-certbot-nginx
echo "✓ NGINX installed"

# 3. Configure NGINX reverse proxy
echo "[3/3] Configuring NGINX..."
cat > /etc/nginx/sites-available/emfi << 'NGINX'
server {
    listen 80;
    server_name 194.233.84.10;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/emfi /etc/nginx/sites-enabled/emfi
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx && systemctl enable nginx
echo "✓ NGINX configured and running"

echo ""
echo "=== Setup Complete ==="
echo "Server berjalan di: http://194.233.84.10"
echo ""
echo "Kalau punya domain, jalankan:"
echo "  certbot --nginx -d yourdomain.com"
echo "  Lalu update TELEGRAM_WEBHOOK_URL di .env ke https://yourdomain.com/webhook/telegram"
