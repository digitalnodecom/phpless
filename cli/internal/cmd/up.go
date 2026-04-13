package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
	"github.com/phpless/cli/internal/api"
	"github.com/phpless/cli/internal/archive"
	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newUpCmd() *cobra.Command {
	var nameFlag string

	cmd := &cobra.Command{
		Use:   "up [directory]",
		Short: "Deploy your app in one command (creates it if needed)",
		Long:  "Checks for .phpless.toml in the current directory. If found, deploys. If not, creates a new app first, writes .phpless.toml, then deploys.",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, err := requireAuth()
			if err != nil {
				return err
			}

			// Resolve directory
			dir := "."
			if len(args) > 0 {
				dir = args[0]
			}

			info, err := os.Stat(dir)
			if err != nil || !info.IsDir() {
				return fmt.Errorf("directory not found: %s", dir)
			}

			// Check if .phpless.toml exists
			projCfg, projDir, findErr := config.FindProjectConfig(dir)
			var slug string

			if findErr == nil && projCfg != nil && projCfg.App != "" {
				// Existing app — just deploy
				slug = projCfg.App
				if projCfg.Directory != "" {
					dir = filepath.Join(projDir, projCfg.Directory)
				}
			} else {
				// No config — create app first
				slug, err = resolveAppName(nameFlag, dir)
				if err != nil {
					return err
				}

				spin := ui.NewSpinner("Creating app...")
				spin.Start()
				createResp, createErr := client.CreateApp(&api.CreateAppRequest{
					Name: slug,
				})
				spin.Stop()

				if createErr != nil {
					handleAPIError(createErr)
					return nil
				}

				slug = createResp.App.Slug
				ui.Success("App created: %s", slug)

				// Write .phpless.toml
				if err := writeProjectConfig(dir, slug); err != nil {
					ui.Warn("Could not write .phpless.toml: %s", err)
				} else {
					ui.Success("Created .phpless.toml")
				}

				// Create .phplessignore if it doesn't exist
				ignorePath := filepath.Join(dir, ".phplessignore")
				if _, err := os.Stat(ignorePath); os.IsNotExist(err) {
					if err := os.WriteFile(ignorePath, []byte(archive.DefaultIgnoreRules), 0644); err != nil {
						ui.Warn("Could not create .phplessignore: %s", err)
					}
				}
			}

			// Deploy
			ui.Info("Deploying '%s' to %s...", dir, slug)

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

			url := resp.App.URL
			if url == "" {
				url = fmt.Sprintf("https://%s.phpless.app", slug)
			}

			ui.Success("App live at %s", url)

			return nil
		},
	}

	cmd.Flags().StringVar(&nameFlag, "name", "", "App name (skips prompt if app doesn't exist yet)")

	return cmd
}

// resolveAppName gets the app name from the flag, prompt, or directory name.
func resolveAppName(nameFlag, dir string) (string, error) {
	if nameFlag != "" {
		return nameFlag, nil
	}

	absDir, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	defaultName := filepath.Base(absDir)

	name, err := ui.Prompt(fmt.Sprintf("App name [%s]: ", defaultName))
	if err != nil {
		return "", err
	}
	if name == "" {
		name = defaultName
	}

	return name, nil
}

// writeProjectConfig writes a .phpless.toml file in the given directory.
func writeProjectConfig(dir, slug string) error {
	cfg := config.ProjectConfig{
		App:       slug,
		Directory: ".",
	}

	path := filepath.Join(dir, config.ProjectConfigFile)
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	return toml.NewEncoder(f).Encode(cfg)
}
