package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
	"github.com/phpless/cli/internal/archive"
	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

// frameworkInfo holds detection results for a PHP framework.
type frameworkInfo struct {
	Name    string
	WebRoot string
}

// detectFramework scans the given directory for known PHP framework indicators.
func detectFramework(dir string) frameworkInfo {
	// Check for Laravel (artisan file)
	if _, err := os.Stat(filepath.Join(dir, "artisan")); err == nil {
		return frameworkInfo{Name: "Laravel", WebRoot: "public"}
	}

	// Parse composer.json
	data, err := os.ReadFile(filepath.Join(dir, "composer.json"))
	if err != nil {
		return frameworkInfo{Name: "Vanilla PHP", WebRoot: "/"}
	}

	var composer struct {
		Require map[string]string `json:"require"`
	}
	if err := json.Unmarshal(data, &composer); err != nil {
		return frameworkInfo{Name: "Vanilla PHP", WebRoot: "/"}
	}

	if _, ok := composer.Require["laravel/framework"]; ok {
		return frameworkInfo{Name: "Laravel", WebRoot: "public"}
	}
	if _, ok := composer.Require["symfony/framework-bundle"]; ok {
		return frameworkInfo{Name: "Symfony", WebRoot: "public"}
	}
	if _, ok := composer.Require["cakephp/cakephp"]; ok {
		return frameworkInfo{Name: "CakePHP", WebRoot: "webroot"}
	}
	if _, ok := composer.Require["codeigniter4/framework"]; ok {
		return frameworkInfo{Name: "CodeIgniter 4", WebRoot: "public"}
	}
	if _, ok := composer.Require["slim/slim"]; ok {
		return frameworkInfo{Name: "Slim", WebRoot: "public"}
	}
	if _, ok := composer.Require["yiisoft/yii2"]; ok {
		return frameworkInfo{Name: "Yii2", WebRoot: "web"}
	}

	return frameworkInfo{Name: "Vanilla PHP", WebRoot: "/"}
}

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

			// Detect framework
			fw := detectFramework(".")
			ui.Success("Detected framework: %s", fw.Name)
			if fw.WebRoot != "/" {
				fmt.Printf("  Suggested web_root: %s\n", fw.WebRoot)
			}

			return nil
		},
	}
}
