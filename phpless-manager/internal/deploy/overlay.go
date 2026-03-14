package deploy

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// DeployToOverlay mounts a tenant's overlay image and syncs app code into it.
func DeployToOverlay(overlayPath, appDir string, persistentPaths []string, envContent, caddyfileContent, workersConfig string) error {
	if _, err := os.Stat(overlayPath); os.IsNotExist(err) {
		return fmt.Errorf("overlay image not found: %s", overlayPath)
	}

	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		return fmt.Errorf("app directory not found: %s", appDir)
	}

	// Create temporary mount point
	mountDir, err := os.MkdirTemp("", "phpless-deploy-*")
	if err != nil {
		return fmt.Errorf("create mount dir: %w", err)
	}
	defer os.RemoveAll(mountDir)

	// Mount overlay image
	if err := runCmd("mount", "-o", "loop", overlayPath, mountDir); err != nil {
		return fmt.Errorf("mount overlay: %w", err)
	}
	defer runCmd("umount", mountDir)

	// Ensure overlay directory structure
	upperApp := filepath.Join(mountDir, "upper", "app")
	workDir := filepath.Join(mountDir, "work")
	os.MkdirAll(upperApp, 0755)
	os.MkdirAll(workDir, 0755)

	// Build rsync args: always exclude Laravel runtime dirs, plus per-file persistent paths
	rsyncArgs := []string{"-a", "--delete",
		"--exclude=storage/framework",
		"--exclude=storage/logs",
	}
	for _, p := range persistentPaths {
		rsyncArgs = append(rsyncArgs, "--exclude="+p)
	}
	rsyncArgs = append(rsyncArgs, appDir+"/", upperApp+"/")

	if err := runCmd("rsync", rsyncArgs...); err != nil {
		return fmt.Errorf("rsync app code: %w", err)
	}

	// Write env vars to /etc/phpless.env (not /app/.env — avoids collision with app's own .env)
	etcDir := filepath.Join(mountDir, "etc")
	os.MkdirAll(etcDir, 0755)
	if envContent != "" {
		envPath := filepath.Join(etcDir, "phpless.env")
		if err := os.WriteFile(envPath, []byte(envContent), 0600); err != nil {
			return fmt.Errorf("write phpless.env: %w", err)
		}
	}

	// Write .caddyfile if content provided
	if caddyfileContent != "" {
		caddyPath := filepath.Join(upperApp, ".caddyfile")
		if err := os.WriteFile(caddyPath, []byte(caddyfileContent), 0644); err != nil {
			return fmt.Errorf("write .caddyfile: %w", err)
		}
	}

	// Write workers config to /etc/phpless-workers.json
	if workersConfig != "" {
		workersPath := filepath.Join(etcDir, "phpless-workers.json")
		if err := os.WriteFile(workersPath, []byte(workersConfig), 0644); err != nil {
			return fmt.Errorf("write phpless-workers.json: %w", err)
		}
	} else {
		// Remove stale config if workers were removed
		os.Remove(filepath.Join(etcDir, "phpless-workers.json"))
	}

	// Create /app/storage structure in overlay upper layer
	upperStorage := filepath.Join(mountDir, "upper", "app", "storage")
	os.MkdirAll(upperStorage, 0777)
	os.MkdirAll(filepath.Join(upperStorage, "framework", "views"), 0777)
	os.MkdirAll(filepath.Join(upperStorage, "framework", "cache", "data"), 0777)
	os.MkdirAll(filepath.Join(upperStorage, "framework", "sessions"), 0777)
	os.MkdirAll(filepath.Join(upperStorage, "logs"), 0777)

	return nil
}

// DeployToRootfs mounts a tenant's rootfs image and syncs app code into /app/.
func DeployToRootfs(rootfsPath, appDir string, persistentPaths []string, envContent, caddyfileContent, workersConfig string) error {
	if _, err := os.Stat(rootfsPath); os.IsNotExist(err) {
		return fmt.Errorf("rootfs image not found: %s", rootfsPath)
	}

	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		return fmt.Errorf("app directory not found: %s", appDir)
	}

	mountDir, err := os.MkdirTemp("", "phpless-deploy-*")
	if err != nil {
		return fmt.Errorf("create mount dir: %w", err)
	}
	defer os.RemoveAll(mountDir)

	if err := runCmd("mount", "-o", "loop", rootfsPath, mountDir); err != nil {
		return fmt.Errorf("mount rootfs: %w", err)
	}
	defer runCmd("umount", mountDir)

	appDir2 := filepath.Join(mountDir, "app")
	os.MkdirAll(appDir2, 0755)

	// Build rsync args: always exclude Laravel runtime dirs, plus per-file persistent paths
	rsyncArgs := []string{"-a", "--delete",
		"--exclude=storage/framework",
		"--exclude=storage/logs",
	}
	for _, p := range persistentPaths {
		rsyncArgs = append(rsyncArgs, "--exclude="+p)
	}
	rsyncArgs = append(rsyncArgs, appDir+"/", appDir2+"/")

	if err := runCmd("rsync", rsyncArgs...); err != nil {
		return fmt.Errorf("rsync app code: %w", err)
	}

	// Write env vars to /etc/phpless.env (not /app/.env — avoids collision with app's own .env)
	if envContent != "" {
		envPath := filepath.Join(mountDir, "etc", "phpless.env")
		if err := os.WriteFile(envPath, []byte(envContent), 0600); err != nil {
			return fmt.Errorf("write phpless.env: %w", err)
		}
	}

	// Write .caddyfile if content provided
	if caddyfileContent != "" {
		caddyPath := filepath.Join(mountDir, "app", ".caddyfile")
		if err := os.WriteFile(caddyPath, []byte(caddyfileContent), 0644); err != nil {
			return fmt.Errorf("write .caddyfile: %w", err)
		}
	}

	// Write workers config to /etc/phpless-workers.json
	if workersConfig != "" {
		workersPath := filepath.Join(mountDir, "etc", "phpless-workers.json")
		if err := os.WriteFile(workersPath, []byte(workersConfig), 0644); err != nil {
			return fmt.Errorf("write phpless-workers.json: %w", err)
		}
	} else {
		os.Remove(filepath.Join(mountDir, "etc", "phpless-workers.json"))
	}

	// Create /app/storage structure — runtime dirs are excluded from rsync so they survive redeploys
	storagePath := filepath.Join(mountDir, "app", "storage")
	os.MkdirAll(storagePath, 0777)
	os.MkdirAll(filepath.Join(storagePath, "framework", "views"), 0777)
	os.MkdirAll(filepath.Join(storagePath, "framework", "cache", "data"), 0777)
	os.MkdirAll(filepath.Join(storagePath, "framework", "sessions"), 0777)
	os.MkdirAll(filepath.Join(storagePath, "logs"), 0777)

	return nil
}

// CreateOverlay creates a new sparse ext4 overlay image.
func CreateOverlay(path string, sizeMB int) error {
	// Create sparse file
	size := fmt.Sprintf("%dM", sizeMB)
	if err := runCmd("dd", "if=/dev/zero", fmt.Sprintf("of=%s", path),
		"bs=1M", "count=0", fmt.Sprintf("seek=%d", sizeMB)); err != nil {
		return fmt.Errorf("create sparse file: %w", err)
	}

	// Format as ext4
	if err := runCmd("mkfs.ext4", "-q", "-F", path); err != nil {
		os.Remove(path)
		return fmt.Errorf("format ext4: %w", err)
	}

	_ = size
	return nil
}

// runCmd executes a command and returns an error with output on failure.
func runCmd(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: %s: %w", name, string(out), err)
	}
	return nil
}
