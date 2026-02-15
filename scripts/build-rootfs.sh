#!/usr/bin/env bash
# build-rootfs.sh — Build the base rootfs ext4 image with FrankenPHP
set -euo pipefail

ROOTFS_DIR="/srv/firecracker/base/rootfs"
ROOTFS_IMG="/srv/firecracker/base/rootfs-base.ext4"
ROOTFS_SQFS="/srv/firecracker/base/rootfs-base.sqfs"
KERNEL_DIR="/srv/firecracker/base/kernel"
FRANKENPHP_VERSION="1.4.2"
KERNEL_VERSION="5.10"
IMG_SIZE_MB=512

echo "=== Building PHPless Base RootFS ==="

if [[ $EUID -ne 0 ]]; then
    echo "Error: run as root" >&2
    exit 1
fi

# 1. Download kernel
echo "[1/5] Downloading Firecracker-compatible kernel..."
KERNEL_URL="https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/kernels/vmlinux-${KERNEL_VERSION}.bin"
if [[ ! -f "${KERNEL_DIR}/vmlinux-${KERNEL_VERSION}" ]]; then
    curl -sL "$KERNEL_URL" -o "${KERNEL_DIR}/vmlinux-${KERNEL_VERSION}"
    echo "  Kernel downloaded: ${KERNEL_DIR}/vmlinux-${KERNEL_VERSION} ✓"
else
    echo "  Kernel already exists ✓"
fi

# 2. Bootstrap Debian rootfs
echo "[2/5] Bootstrapping Debian bookworm rootfs..."
rm -rf "$ROOTFS_DIR"
mkdir -p "$ROOTFS_DIR"

debootstrap --variant=minbase --include=procps,iproute2,iputils-ping,ca-certificates,curl \
    bookworm "$ROOTFS_DIR" http://deb.debian.org/debian

echo "  Debian bookworm bootstrapped ✓"

# 3. Download FrankenPHP static binary
echo "[3/5] Downloading FrankenPHP static binary..."
FRANKENPHP_URL="https://github.com/dunglas/frankenphp/releases/download/v${FRANKENPHP_VERSION}/frankenphp-linux-x86_64"
curl -sL "$FRANKENPHP_URL" -o "${ROOTFS_DIR}/usr/local/bin/frankenphp"
chmod +x "${ROOTFS_DIR}/usr/local/bin/frankenphp"
echo "  FrankenPHP downloaded ✓"

# 4. Install configs into rootfs
echo "[4/5] Installing configs..."

# php.ini
mkdir -p "${ROOTFS_DIR}/etc/php"
cp /var/www/phpless/configs/php.ini "${ROOTFS_DIR}/etc/php/php.ini"

# Custom init script
cp /var/www/phpless/rootfs/init "${ROOTFS_DIR}/sbin/init"
chmod +x "${ROOTFS_DIR}/sbin/init"

# FrankenPHP Caddyfile
mkdir -p "${ROOTFS_DIR}/etc/frankenphp"
cp /var/www/phpless/rootfs/Caddyfile "${ROOTFS_DIR}/etc/frankenphp/Caddyfile"

# Test app
mkdir -p "${ROOTFS_DIR}/app/public"
cp /var/www/phpless/test-app/public/index.php "${ROOTFS_DIR}/app/public/index.php"

# Worker script
cp /var/www/phpless/test-app/public/worker.php "${ROOTFS_DIR}/app/public/worker.php"

# Preload script
if [[ -f /var/www/phpless/test-app/preload.php ]]; then
    cp /var/www/phpless/test-app/preload.php "${ROOTFS_DIR}/app/preload.php"
fi

# DNS resolution
echo "nameserver 8.8.8.8" > "${ROOTFS_DIR}/etc/resolv.conf"

# Hostname
echo "phpless" > "${ROOTFS_DIR}/etc/hostname"

# Clean up to reduce image size
rm -rf "${ROOTFS_DIR}/var/cache/apt"/*
rm -rf "${ROOTFS_DIR}/var/lib/apt/lists"/*
rm -rf "${ROOTFS_DIR}/usr/share/doc"/*
rm -rf "${ROOTFS_DIR}/usr/share/man"/*

echo "  Configs installed ✓"

# 5. Create ext4 image
echo "[5/5] Creating ext4 image (${IMG_SIZE_MB}MB)..."
dd if=/dev/zero of="$ROOTFS_IMG" bs=1M count=$IMG_SIZE_MB status=none
mkfs.ext4 -q -F "$ROOTFS_IMG"

MOUNT_DIR=$(mktemp -d)
mount -o loop "$ROOTFS_IMG" "$MOUNT_DIR"
cp -a "${ROOTFS_DIR}/." "$MOUNT_DIR/"
umount "$MOUNT_DIR"
rmdir "$MOUNT_DIR"

echo "  ext4 image created: $ROOTFS_IMG ✓"

# Also create SquashFS for overlay mode
echo "Creating SquashFS image..."
mksquashfs "$ROOTFS_DIR" "$ROOTFS_SQFS" -comp zstd -quiet -noappend
echo "  SquashFS image created: $ROOTFS_SQFS ✓"

# Summary
echo ""
echo "=== RootFS Build Complete ==="
echo "  ext4:     $ROOTFS_IMG ($(du -sh "$ROOTFS_IMG" | cut -f1))"
echo "  squashfs: $ROOTFS_SQFS ($(du -sh "$ROOTFS_SQFS" | cut -f1))"
echo "  kernel:   ${KERNEL_DIR}/vmlinux-${KERNEL_VERSION}"
echo ""
echo "Next: Run scripts/create-vm.sh to boot a test VM"
