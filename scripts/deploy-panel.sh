#!/usr/bin/env bash
set -euo pipefail

SERVER="root@65.108.14.212"
REMOTE_DIR="/var/www/phpless/panel"
LOCAL_DIR="/var/www/phpless/panel"

echo "=== PHPless Panel Deployment ==="

# Step 1: Build frontend locally
echo "[1/6] Building frontend assets..."
cd "$LOCAL_DIR"
npm run build

# Step 2: Install PHP 8.4 FPM + Node on server if needed
echo "[2/6] Ensuring server dependencies..."
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
echo "[3/6] Syncing panel files to server..."
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
echo "[4/6] Running server-side setup..."
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

# CRITICAL: rsync from macOS sets ownership to 501:staff on ALL files/dirs.
# PHP-FPM runs as www-data and:
#   - cannot read vendor/         → 419/500 errors
#   - cannot write database dir   → sessions not created → 419 on every login
# Fix ownership on the entire panel dir, then tighten permissions appropriately.
chown -R www-data:www-data /var/www/phpless/panel
chmod -R 755 /var/www/phpless/panel/vendor
chmod -R 775 /var/www/phpless/panel/storage /var/www/phpless/panel/bootstrap/cache
chmod 775 /var/www/phpless/panel/database
chmod 664 /var/www/phpless/panel/database/database.sqlite

# Clear all caches (must run after chown so www-data can write cache files)
php artisan cache:clear
php artisan config:clear
php artisan route:clear
php artisan view:clear
SETUP

# Step 5: Deploy server configs
echo "[5/6] Deploying server configs..."
scp /var/www/phpless/configs/server/phpless-fpm.conf "$SERVER:/etc/php/8.4/fpm/pool.d/phpless.conf"
scp /var/www/phpless/configs/server/phpless-queue.service "$SERVER:/etc/systemd/system/phpless-queue.service"
scp /var/www/phpless/configs/server/phpless-sudoers "$SERVER:/etc/sudoers.d/phpless"
scp /var/www/phpless/configs/phpless-manager.service "$SERVER:/etc/systemd/system/phpless-manager.service"
ssh "$SERVER" 'chmod 440 /etc/sudoers.d/phpless'

# Step 6: Restart services
echo "[6/6] Restarting services..."
ssh "$SERVER" 'bash -s' << 'SERVICES'
# Allow www-data to access the VM manager socket
chmod 0666 /var/fc/manager.sock 2>/dev/null || true

# Create log directory for per-app Caddy access logs
mkdir -p /var/log/phpless/apps
chown -R caddy:caddy /var/log/phpless
chmod 755 /var/log/phpless /var/log/phpless/apps
setfacl -d -m u:www-data:r /var/log/phpless/apps 2>/dev/null || true

# Restart PHP-FPM
systemctl restart php8.4-fpm

# Reload systemd and start queue worker
systemctl daemon-reload
systemctl enable phpless-queue
systemctl restart phpless-queue

# Regenerate Caddy config from database (preserves per-app routes)
cd /var/www/phpless/panel
php artisan tinker --execute="app(App\Services\CaddyConfigManager::class)->regenerateAndReload();" 2>&1 || true
SERVICES

echo ""
echo "=== Deployment complete! ==="
echo "Panel: https://phpless.digitalno.de"
