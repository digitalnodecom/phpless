package cmd

import (
	"fmt"
	"os"

	"github.com/BurntSushi/toml"
	"github.com/phpless/cli/internal/archive"
	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newInitCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "init",
		Short: "Initialize a .phpless.toml config in the current directory",
		RunE: func(cmd *cobra.Command, args []string) error {
			if _, err := os.Stat(config.ProjectConfigFile); err == nil {
				ui.Warn(".phpless.toml already exists in this directory.")
				return nil
			}

			slug, err := ui.Prompt("App slug: ")
			if err != nil {
				return err
			}
			if slug == "" {
				return fmt.Errorf("app slug is required")
			}

			cfg := config.ProjectConfig{
				App:       slug,
				Directory: ".",
			}

			f, err := os.OpenFile(config.ProjectConfigFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
			if err != nil {
				return fmt.Errorf("failed to create .phpless.toml: %w", err)
			}
			defer f.Close()

			if err := toml.NewEncoder(f).Encode(cfg); err != nil {
				return err
			}

			ui.Success("Created .phpless.toml")
			fmt.Printf("  app = %q\n", slug)

			// Create .phplessignore if it doesn't exist
			const ignoreFile = ".phplessignore"
			if _, err := os.Stat(ignoreFile); os.IsNotExist(err) {
				if err := os.WriteFile(ignoreFile, []byte(archive.DefaultIgnoreRules), 0644); err != nil {
					ui.Warn("Could not create %s: %s", ignoreFile, err)
				} else {
					ui.Success("Created %s", ignoreFile)
				}
			}

			return nil
		},
	}
}
