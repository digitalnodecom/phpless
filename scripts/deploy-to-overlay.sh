#!/usr/bin/env bash
# deploy-to-overlay.sh — Deploy PHP app code into a tenant's overlay image
set -euo pipefail

VM_ID="${1:?Usage: $0 <vm-id> <app-dir>}"
APP_DIR="${2:?Usage: $0 <vm-id> <app-dir>}"

OVERLAY="/srv/firecracker/tenants/${VM_ID}-overlay.ext4"

if [[ ! -f "$OVERLAY" ]]; then
    echo "Error: overlay not found: $OVERLAY" >&2
    exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
    echo "Error: app directory not found: $APP_DIR" >&2
    exit 1
fi

echo "Deploying ${APP_DIR} to VM ${VM_ID} overlay..."

MOUNT_DIR=$(mktemp -d)
mount -o loop "$OVERLAY" "$MOUNT_DIR"

# Create overlay directories
mkdir -p "${MOUNT_DIR}/upper/app"
mkdir -p "${MOUNT_DIR}/work"

# Rsync app code into overlay upper dir
rsync -a --delete "${APP_DIR}/" "${MOUNT_DIR}/upper/app/"

umount "$MOUNT_DIR"
rmdir "$MOUNT_DIR"

echo "Deployed ✓"
echo "Restart the VM to pick up changes, or use hot-reload if supported."
