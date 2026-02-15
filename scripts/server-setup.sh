#!/usr/bin/env bash
# server-setup.sh — Bootstrap a fresh Ubuntu 24.04 Hetzner server for PHPless
set -euo pipefail

FIRECRACKER_VERSION="v1.10.1"
GO_VERSION="1.23.5"

echo "=== PHPless Server Setup ==="

# Require root
if [[ $EUID -ne 0 ]]; then
    echo "Error: run as root" >&2
    exit 1
fi

# 1. System update
echo "[1/8] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# 2. Verify KVM support
echo "[2/8] Verifying KVM support..."
if [[ ! -e /dev/kvm ]]; then
    echo "Error: /dev/kvm not found. KVM support is required for Firecracker." >&2
    echo "Ensure you have a dedicated server (not VPS) with hardware virtualization enabled." >&2
    exit 1
fi
echo "  /dev/kvm exists ✓"

# Set proper permissions
chmod 666 /dev/kvm

# 3. Install dependencies
echo "[3/8] Installing dependencies..."
apt-get install -y -qq \
    curl wget git jq \
    debootstrap squashfs-tools \
    iproute2 iptables \
    bridge-utils \
    e2fsprogs \
    wrk \
    build-essential \
    ufw \
    rsync

# 4. Install Firecracker
echo "[4/8] Installing Firecracker ${FIRECRACKER_VERSION}..."
ARCH=$(uname -m)
if [[ "$ARCH" != "x86_64" ]]; then
    echo "Error: Firecracker requires x86_64" >&2
    exit 1
fi

FC_URL="https://github.com/firecracker-microvm/firecracker/releases/download/${FIRECRACKER_VERSION}/firecracker-${FIRECRACKER_VERSION}-${ARCH}.tgz"
TMP_DIR=$(mktemp -d)
curl -sL "$FC_URL" -o "$TMP_DIR/firecracker.tgz"
tar -xzf "$TMP_DIR/firecracker.tgz" -C "$TMP_DIR"
cp "$TMP_DIR/release-${FIRECRACKER_VERSION}-${ARCH}/firecracker-${FIRECRACKER_VERSION}-${ARCH}" /usr/local/bin/firecracker
cp "$TMP_DIR/release-${FIRECRACKER_VERSION}-${ARCH}/jailer-${FIRECRACKER_VERSION}-${ARCH}" /usr/local/bin/jailer
chmod +x /usr/local/bin/firecracker /usr/local/bin/jailer
rm -rf "$TMP_DIR"
echo "  Firecracker $(firecracker --version 2>&1 | head -1) installed ✓"

# 5. Install Go
echo "[5/8] Installing Go ${GO_VERSION}..."
if ! command -v go &>/dev/null || [[ "$(go version)" != *"${GO_VERSION}"* ]]; then
    curl -sL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf /tmp/go.tar.gz
    rm /tmp/go.tar.gz
    if ! grep -q '/usr/local/go/bin' /etc/profile.d/go.sh 2>/dev/null; then
        echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
    fi
    export PATH=$PATH:/usr/local/go/bin
fi
echo "  Go $(go version) installed ✓"

# 6. Install PHP 8.4 + Composer
echo "[6/8] Installing PHP 8.4..."
apt-get install -y -qq software-properties-common
add-apt-repository -y ppa:ondrej/php 2>/dev/null || true
apt-get update -qq
apt-get install -y -qq \
    php8.4-cli php8.4-mbstring php8.4-xml php8.4-curl \
    php8.4-zip php8.4-sqlite3 php8.4-opcache
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
echo "  PHP $(php -v | head -1) installed ✓"

# 7. Install Caddy
echo "[7/8] Installing Caddy..."
if ! command -v caddy &>/dev/null; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
fi
echo "  Caddy $(caddy version) installed ✓"

# 8. Create filesystem structure
echo "[8/8] Creating directory structure..."
mkdir -p /srv/firecracker/base/kernel
mkdir -p /srv/firecracker/base/rootfs
mkdir -p /srv/firecracker/tenants
mkdir -p /srv/firecracker/jail
mkdir -p /srv/firecracker/sockets
mkdir -p /var/fc

# Set up firewall
echo "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# Enable IP forwarding (persistent)
if ! grep -q 'net.ipv4.ip_forward=1' /etc/sysctl.conf; then
    echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
fi
sysctl -w net.ipv4.ip_forward=1

echo ""
echo "=== Server setup complete ==="
echo "Next steps:"
echo "  1. Run scripts/build-rootfs.sh to build the base image"
echo "  2. Run scripts/create-vm.sh to boot a test VM"
