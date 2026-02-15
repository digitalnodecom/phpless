#!/usr/bin/env bash
set -euo pipefail

SERVER="root@65.108.14.212"
REMOTE_DIR="/var/www/phpless/panel"
LOCAL_DIR="/var/www/phpless/panel"

echo "=== PHPless Panel Deployment ==="

# Step 1: Build frontend locally
echo "[1/7] Building frontend assets..."
cd "$LOCAL_DIR"
npm run build

# Step 2: Install PHP 8.4 FPM + Node on server if needed
echo "[2/7] Ensuring server dependencies..."
ssh "$SERVER" 'bash -s' << 'DEPS'
# PHP 8.4 FPM
if ! dpkg -l php8.4-fpm &>/dev/null; then
    echo "Installing PHP 8.4 FPM..."
    add-apt-repository -y ppa:ondrej/php
    apt-get update
    apt-get install -y php8.4-fpm php8.4-cli php8.4-sqlite3 php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-bcmath
fi

# Ensure Node.js 20+
if ! command -v node &>/dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Ensure Composer
if ! command -v composer &>/dev/null; then
    echo "Installing Composer..."
    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
fi
DEPS

# Step 3: Rsync panel to server
echo "[3/7] Syncing panel files to server..."
rsync -avz --delete \
    --exclude='.env' \
    --exclude='node_modules' \
    --exclude='vendor' \
    --exclude='database/database.sqlite' \
    --exclude='storage/logs/*' \
    --exclude='storage/framework/cache/*' \
    --exclude='storage/framework/sessions/*' \
    --exclude='storage/framework/views/*' \
    --exclude='.git' \
    "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

# Step 4: Server-side setup
echo "[4/7] Running server-side setup..."
ssh "$SERVER" 'bash -s' << 'SETUP'
cd /var/www/phpless/panel

# Install composer deps (production)
composer install --no-dev --optimize-autoloader --no-interaction 2>&1 | tail -5

# Setup .env if not exists
if [ ! -f .env ]; then
    cp .env.production .env
    php artisan key:generate --force
fi

# Ensure SQLite database exists
touch database/database.sqlite

# Run migrations
php artisan migrate --force

# Cache config/routes/views
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Set permissions
chown -R www-data:www-data storage bootstrap/cache database
chmod -R 775 storage bootstrap/cache
chmod 664 database/database.sqlite
SETUP

# Step 5: Deploy server configs
echo "[5/7] Deploying server configs..."
scp /var/www/phpless/configs/server/phpless-fpm.conf "$SERVER:/etc/php/8.4/fpm/pool.d/phpless.conf"
scp /var/www/phpless/configs/server/phpless-queue.service "$SERVER:/etc/systemd/system/phpless-queue.service"
scp /var/www/phpless/configs/server/phpless-sudoers "$SERVER:/etc/sudoers.d/phpless"
ssh "$SERVER" 'chmod 440 /etc/sudoers.d/phpless'

# Step 6: Set up manager socket permissions
echo "[6/7] Configuring socket permissions..."
ssh "$SERVER" 'bash -s' << 'SOCKET'
# Allow www-data to access the VM manager socket
chmod 0666 /var/fc/manager.sock 2>/dev/null || true

# Restart PHP-FPM
systemctl restart php8.4-fpm

# Reload systemd and start queue worker
systemctl daemon-reload
systemctl enable phpless-queue
systemctl restart phpless-queue
SOCKET

# Step 7: Update Caddy config
echo "[7/7] Updating Caddy config..."
ssh "$SERVER" 'bash -s' << 'CADDY'
# Generate initial Caddyfile with panel block
cat > /etc/caddy/Caddyfile << 'EOF'
phpless.digitalno.de {
	root * /var/www/phpless/panel/public
	php_fastcgi unix//run/php/php8.4-fpm.sock
	file_server
	encode gzip
}

*.phpless.digitalno.de {
	tls {
		on_demand
	}
	respond "Not Found" 404
}
EOF
systemctl reload caddy
CADDY

echo ""
echo "=== Deployment complete! ==="
echo "Panel: https://phpless.digitalno.de"
