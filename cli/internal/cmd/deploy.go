package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/phpless/cli/internal/archive"
	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newDeployCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "deploy [directory]",
		Short: "Deploy code to an app",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			// Resolve directory
			dir := "."
			if len(args) > 0 {
				dir = args[0]
			} else {
				projCfg, projDir, findErr := config.FindProjectConfig(".")
				if findErr == nil && projCfg != nil && projCfg.Directory != "" {
					dir = filepath.Join(projDir, projCfg.Directory)
				}
			}

			// Verify directory exists
			info, err := os.Stat(dir)
			if err != nil || !info.IsDir() {
				return fmt.Errorf("directory not found: %s", dir)
			}

			ui.Info("Deploying '%s' to %s...", dir, slug)

			// Create archive
			tarBuf, fileCount, err := archive.CreateTarGz(dir)
			if err != nil {
				return fmt.Errorf("failed to create archive: %w", err)
			}

			sizeKB := float64(tarBuf.Len()) / 1024
			sizeMB := sizeKB / 1024
			var sizeStr string
			if sizeMB >= 1 {
				sizeStr = fmt.Sprintf("%.1f MB", sizeMB)
			} else {
				sizeStr = fmt.Sprintf("%.1f KB", sizeKB)
			}
			ui.Info("  %d files, %s compressed", fileCount, sizeStr)

			// Upload and deploy
			client, err := requireAuth()
			if err != nil {
				return err
			}

			spin := ui.NewSpinner("Deploying...")
			spin.Start()
			resp, err := client.Deploy(slug, tarBuf, "deploy.tar.gz")
			spin.Stop()

			if err != nil {
				handleAPIError(err)
				return nil
			}

			if ui.JSONMode {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(resp)
			}

			ui.Success("Deployed successfully!")
			if resp.App.URL != "" {
				fmt.Printf("  URL: %s\n", resp.App.URL)
			}

			// Show detected databases
			printDetectedDatabases(client, slug)

			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug to deploy to")

	return cmd
}
