package deploy

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// SqliteDatabase represents a SQLite database configuration from the panel.
type SqliteDatabase struct {
	Path          string `json:"path"`
	BackupEnabled bool   `json:"backup_enabled"`
}

// DeployToOverlay mounts a tenant's overlay image and syncs app code into it.
func DeployToOverlay(overlayPath, appDir string, persistentPaths []string, envContent, caddyfileContent, workersConfig string, cronEnabled bool, sqliteDatabases []SqliteDatabase) error {
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

	// Build rsync args: persistent paths are excluded so they survive redeploys
	rsyncArgs := []string{"-a", "--delete"}
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

	// Write crontab for Laravel scheduler if cron is enabled
	if cronEnabled {
		cronDir := filepath.Join(mountDir, "var", "spool", "cron", "crontabs")
		os.MkdirAll(cronDir, 0755)
		crontab := "* * * * * cd /app && php artisan schedule:run >> /var/log/cron.log 2>&1\n"
		if err := os.WriteFile(filepath.Join(cronDir, "root"), []byte(crontab), 0600); err != nil {
			return fmt.Errorf("write crontab: %w", err)
		}
	} else {
		os.Remove(filepath.Join(mountDir, "var", "spool", "cron", "crontabs", "root"))
	}

	// Generate Litestream config for backed-up SQLite databases
	if err := writeLitestreamConfig(etcDir, sqliteDatabases); err != nil {
		return fmt.Errorf("write litestream.yml: %w", err)
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
// initScriptPath is the canonical location of the init script on the host.
// It gets synced into tenant rootfs images on every deploy so that init
// improvements (SSH, workers, overlay logging, etc.) propagate without
// requiring a full rootfs rebuild.
var InitScriptPath = "/srv/firecracker/base/rootfs/init"

func DeployToRootfs(rootfsPath, appDir string, persistentPaths []string, envContent, caddyfileContent, workersConfig string, cronEnabled bool, sqliteDatabases []SqliteDatabase) error {
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

	// Sync init script and worker manager from base rootfs so improvements
	// propagate to existing VMs without requiring a full rootfs rebuild.
	baseDir := filepath.Dir(InitScriptPath) // e.g. /srv/firecracker/base/rootfs
	if initData, err := os.ReadFile(InitScriptPath); err == nil {
		os.WriteFile(filepath.Join(mountDir, "init"), initData, 0755)
	}
	workersBin := filepath.Join(baseDir, "usr", "local", "bin", "phpless-workers")
	if binData, err := os.ReadFile(workersBin); err == nil {
		os.MkdirAll(filepath.Join(mountDir, "usr", "local", "bin"), 0755)
		os.WriteFile(filepath.Join(mountDir, "usr", "local", "bin", "phpless-workers"), binData, 0755)
	}
	lsHelper := filepath.Join(baseDir, "usr", "local", "lib", "phpless-ls.php")
	if data, err := os.ReadFile(lsHelper); err == nil {
		os.MkdirAll(filepath.Join(mountDir, "usr", "local", "lib"), 0755)
		os.WriteFile(filepath.Join(mountDir, "usr", "local", "lib", "phpless-ls.php"), data, 0644)
	}

	appDir2 := filepath.Join(mountDir, "app")
	os.MkdirAll(appDir2, 0755)

	// Build rsync args: persistent paths are excluded so they survive redeploys
	rsyncArgs := []string{"-a", "--delete"}
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

	// Write crontab for Laravel scheduler if cron is enabled
	if cronEnabled {
		cronDir := filepath.Join(mountDir, "var", "spool", "cron", "crontabs")
		os.MkdirAll(cronDir, 0755)
		crontab := "* * * * * cd /app && php artisan schedule:run >> /var/log/cron.log 2>&1\n"
		if err := os.WriteFile(filepath.Join(cronDir, "root"), []byte(crontab), 0600); err != nil {
			return fmt.Errorf("write crontab: %w", err)
		}
	} else {
		os.Remove(filepath.Join(mountDir, "var", "spool", "cron", "crontabs", "root"))
	}

	// Generate Litestream config for backed-up SQLite databases
	rootEtcDir := filepath.Join(mountDir, "etc")
	if err := writeLitestreamConfig(rootEtcDir, sqliteDatabases); err != nil {
		return fmt.Errorf("write litestream.yml: %w", err)
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

// writeLitestreamConfig generates /etc/litestream.yml for databases with backup_enabled,
// or removes it if no databases need backup. mountDir is the root of the mounted filesystem.
func writeLitestreamConfig(etcDir string, databases []SqliteDatabase) error {
	configPath := filepath.Join(etcDir, "litestream.yml")

	// Collect backed-up databases
	var backed []SqliteDatabase
	for _, db := range databases {
		if db.BackupEnabled {
			backed = append(backed, db)
		}
	}

	if len(backed) == 0 {
		os.Remove(configPath)
		return nil
	}

	// Ensure backup directory exists on the filesystem
	// etcDir is <mountDir>/etc, so go up one level to find the mount root
	mountDir := filepath.Dir(etcDir)
	backupDir := filepath.Join(mountDir, "var", "backups", "litestream")
	os.MkdirAll(backupDir, 0755)

	// Build YAML config
	var b strings.Builder
	b.WriteString("dbs:\n")
	for _, db := range backed {
		dbPath := "/app/" + db.Path
		replicaName := sanitizeReplicaPath(db.Path)
		b.WriteString(fmt.Sprintf("  - path: %s\n", dbPath))
		b.WriteString("    replicas:\n")
		b.WriteString("      - type: file\n")
		b.WriteString(fmt.Sprintf("        path: /var/backups/litestream/%s\n", replicaName))
	}

	os.MkdirAll(etcDir, 0755)
	return os.WriteFile(configPath, []byte(b.String()), 0644)
}

// sanitizeReplicaPath converts a relative app path like "database/database.sqlite"
// into a safe directory name like "database-database-sqlite".
func sanitizeReplicaPath(path string) string {
	s := strings.ReplaceAll(path, "/", "-")
	s = strings.ReplaceAll(s, ".", "-")
	return s
}

// runCmd executes a command and returns an error with output on failure.
func runCmd(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: %s: %w", name, string(out), err)
	}
	return nil
}
