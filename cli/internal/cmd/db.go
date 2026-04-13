package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/phpless/cli/internal/api"
	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newDbCmd() *cobra.Command {
	dbCmd := &cobra.Command{
		Use:   "db",
		Short: "Manage SQLite databases",
	}

	dbCmd.AddCommand(newDbListCmd())
	dbCmd.AddCommand(newDbBackupCmd())
	dbCmd.AddCommand(newDbRestoreCmd())

	return dbCmd
}

func newDbListCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List detected SQLite databases",
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			resp, err := client.GetApp(slug)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			databases := resp.App.SqliteDatabases

			if ui.JSONMode {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(databases)
			}

			if len(databases) == 0 {
				ui.Info("No SQLite databases detected for '%s'.", slug)
				ui.Dim("  Databases are auto-detected during deployment.")
				return nil
			}

			rows := make([][]string, len(databases))
			for i, db := range databases {
				persistent := "no"
				if db.Persistent {
					persistent = "yes"
				}
				backups := "disabled"
				if db.BackupEnabled {
					backups = "enabled"
				}
				detectedAt := db.DetectedAt
				if detectedAt == "" {
					detectedAt = "-"
				}
				rows[i] = []string{db.Path, persistent, backups, detectedAt}
			}
			ui.Table([]string{"PATH", "PERSISTENT", "BACKUPS", "DETECTED AT"}, rows)

			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")

	return cmd
}

func newDbBackupCmd() *cobra.Command {
	backupCmd := &cobra.Command{
		Use:   "backup",
		Short: "Manage database backups",
	}

	backupCmd.AddCommand(newDbBackupEnableCmd())
	backupCmd.AddCommand(newDbBackupDisableCmd())
	backupCmd.AddCommand(newDbBackupDownloadCmd())

	return backupCmd
}

func newDbBackupEnableCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "enable [path]",
		Short: "Enable backups for a SQLite database",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			dbPath, err := resolveDbPath(client, slug, args)
			if err != nil {
				return err
			}

			databases, err := getUpdatedDatabases(client, slug, dbPath, true)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			_, err = client.UpdateDatabases(slug, databases)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			ui.Success("Backups enabled for %s", dbPath)
			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")

	return cmd
}

func newDbBackupDisableCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "disable [path]",
		Short: "Disable backups for a SQLite database",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			dbPath, err := resolveDbPath(client, slug, args)
			if err != nil {
				return err
			}

			databases, err := getUpdatedDatabases(client, slug, dbPath, false)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			_, err = client.UpdateDatabases(slug, databases)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			ui.Success("Backups disabled for %s", dbPath)
			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")

	return cmd
}

func newDbBackupDownloadCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "download [path]",
		Short: "Download a database backup",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			dbPath, err := resolveDbPath(client, slug, args)
			if err != nil {
				return err
			}

			spin := ui.NewSpinner("Downloading backup...")
			spin.Start()
			body, _, err := client.DownloadDatabaseBackup(slug, dbPath)
			spin.Stop()

			if err != nil {
				handleAPIError(err)
				return nil
			}
			defer body.Close()

			// Build filename: {slug}-{sanitized-path}-{timestamp}.tar.gz
			sanitized := strings.ReplaceAll(dbPath, "/", "-")
			sanitized = strings.ReplaceAll(sanitized, ".", "-")
			timestamp := time.Now().Format("20060102-150405")
			filename := fmt.Sprintf("%s-%s-%s.tar.gz", slug, sanitized, timestamp)

			f, err := os.Create(filename)
			if err != nil {
				return fmt.Errorf("failed to create file: %w", err)
			}
			defer f.Close()

			n, err := io.Copy(f, body)
			if err != nil {
				return fmt.Errorf("failed to write backup: %w", err)
			}

			sizeStr := formatBackupSize(n)
			ui.Success("Backup saved to %s (%s)", filename, sizeStr)
			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")

	return cmd
}

func newDbRestoreCmd() *cobra.Command {
	var appSlug string
	var timestamp string
	var yes bool

	cmd := &cobra.Command{
		Use:   "restore [path]",
		Short: "Restore a database from backup",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			dbPath, err := resolveDbPath(client, slug, args)
			if err != nil {
				return err
			}

			if !yes {
				if !ui.Confirm("This will replace the current database. Continue?") {
					ui.Info("Aborted.")
					return nil
				}
			}

			spin := ui.NewSpinner("Restoring database...")
			spin.Start()
			_, err = client.RestoreDatabaseBackup(slug, dbPath, timestamp)
			spin.Stop()

			if err != nil {
				handleAPIError(err)
				return nil
			}

			ui.Success("Database restored from backup")
			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")
	cmd.Flags().StringVar(&timestamp, "timestamp", "", "Restore to a specific point in time (RFC3339)")
	cmd.Flags().BoolVar(&yes, "yes", false, "Skip confirmation prompt")

	return cmd
}

// resolveDbPath picks the database path from args or prompts if ambiguous.
func resolveDbPath(client *api.Client, slug string, args []string) (string, error) {
	if len(args) > 0 {
		return args[0], nil
	}

	// Fetch app to get databases
	resp, err := client.GetApp(slug)
	if err != nil {
		return "", err
	}

	databases := resp.App.SqliteDatabases
	if len(databases) == 0 {
		return "", fmt.Errorf("no SQLite databases detected for '%s'", slug)
	}
	if len(databases) == 1 {
		return databases[0].Path, nil
	}

	// Multiple databases — prompt user to choose
	ui.Info("Multiple databases detected:")
	for i, db := range databases {
		ui.Info("  %d) %s", i+1, db.Path)
	}

	answer, err := ui.Prompt("Select database [1]: ")
	if err != nil {
		return "", err
	}

	idx := 0
	if answer != "" {
		_, err := fmt.Sscanf(answer, "%d", &idx)
		if err != nil || idx < 1 || idx > len(databases) {
			return "", fmt.Errorf("invalid selection: %s", answer)
		}
		idx--
	}

	return databases[idx].Path, nil
}

// getUpdatedDatabases fetches current databases and toggles backup_enabled for the given path.
func getUpdatedDatabases(client *api.Client, slug, dbPath string, enableBackup bool) ([]api.SqliteDatabase, error) {
	resp, err := client.GetApp(slug)
	if err != nil {
		return nil, err
	}

	databases := resp.App.SqliteDatabases
	found := false
	for i, db := range databases {
		if db.Path == dbPath {
			databases[i].BackupEnabled = enableBackup
			if enableBackup {
				databases[i].Persistent = true
			}
			found = true
			break
		}
	}

	if !found {
		return nil, fmt.Errorf("database '%s' not found", dbPath)
	}

	return databases, nil
}

func formatBackupSize(bytes int64) string {
	if bytes >= 1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(bytes)/(1024*1024))
	}
	return fmt.Sprintf("%.1f KB", float64(bytes)/1024)
}

// printDetectedDatabases fetches app details and prints any detected SQLite databases.
// Used after deploy/up commands. Silently returns on any error.
func printDetectedDatabases(client *api.Client, slug string) {
	if ui.JSONMode {
		return
	}

	resp, err := client.GetApp(slug)
	if err != nil {
		return
	}

	for _, db := range resp.App.SqliteDatabases {
		persistent := ""
		if db.Persistent {
			persistent = " (auto-persisted)"
		}
		ui.Success("Detected SQLite: %s%s", db.Path, persistent)
		if !db.BackupEnabled {
			fmt.Println("  Enable backups: phpless db backup enable")
		}
	}
}
