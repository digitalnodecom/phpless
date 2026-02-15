package deploy

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// DeployToOverlay mounts a tenant's overlay image and syncs app code into it.
func DeployToOverlay(overlayPath, appDir string) error {
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

	// Rsync app code into overlay
	if err := runCmd("rsync", "-a", "--delete",
		appDir+"/",
		upperApp+"/",
	); err != nil {
		return fmt.Errorf("rsync app code: %w", err)
	}

	return nil
}

// DeployToRootfs mounts a tenant's rootfs image and syncs app code into /app/public/.
func DeployToRootfs(rootfsPath, appDir string) error {
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

	appPublic := filepath.Join(mountDir, "app", "public")
	os.MkdirAll(appPublic, 0755)

	if err := runCmd("rsync", "-a", "--delete",
		appDir+"/",
		appPublic+"/",
	); err != nil {
		return fmt.Errorf("rsync app code: %w", err)
	}

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
