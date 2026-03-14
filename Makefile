.PHONY: build deploy setup rootfs test-vm benchmark validate clean cli cli-install

# Build the VM manager binary (cross-compile for Linux amd64)
build:
	cd phpless-manager && GOOS=linux GOARCH=amd64 go build -o bin/phpless-manager ./cmd/manager/

# Deploy everything to the server
SERVER=root@65.108.14.212
deploy: build
	rsync -avz --exclude='.git' --exclude='phpless-manager/bin' \
		./ $(SERVER):/var/www/phpless/
	scp phpless-manager/bin/phpless-manager $(SERVER):/usr/local/bin/phpless-manager

# Run server setup (on server)
setup:
	bash scripts/server-setup.sh

# Build rootfs (on server)
rootfs:
	bash scripts/build-rootfs.sh

# Boot a test VM (on server)
test-vm:
	bash scripts/create-vm.sh test

# Stop test VM (on server)
stop-vm:
	bash scripts/stop-vm.sh test

# Run benchmarks (on server)
benchmark:
	bash scripts/benchmark.sh

# Run validation checklist (on server)
validate:
	bash scripts/validate.sh

# Install systemd service (on server)
install-service:
	cp configs/phpless-manager.service /etc/systemd/system/
	cp configs/Caddyfile.simple /etc/caddy/Caddyfile
	systemctl daemon-reload
	systemctl enable phpless-manager
	systemctl restart caddy

# Deploy Laravel panel
panel-deploy:
	bash scripts/deploy-panel.sh

# Fix panel permissions after any manual rsync from macOS (rsync resets ownership to 501:staff)
# Run this any time you see 419/500 errors after deploying
panel-fix-perms:
	ssh $(SERVER) "chown -R www-data:www-data /var/www/phpless/panel && \
		chmod -R 755 /var/www/phpless/panel/vendor && \
		chmod -R 775 /var/www/phpless/panel/storage /var/www/phpless/panel/bootstrap/cache && \
		chmod 775 /var/www/phpless/panel/database && \
		chmod 664 /var/www/phpless/panel/database/database.sqlite && \
		cd /var/www/phpless/panel && php artisan cache:clear && php artisan config:clear && php artisan route:clear && php artisan view:clear && \
		echo 'Permissions fixed.'"

# Build CLI binary (local macOS)
cli:
	cd cli && $(MAKE) build

# Install CLI to /usr/local/bin
cli-install:
	cd cli && $(MAKE) install

# Clean build artifacts
clean:
	rm -f phpless-manager/bin/phpless-manager
	rm -rf cli/bin/
