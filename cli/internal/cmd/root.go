package cmd

import (
	"fmt"
	"os"

	"github.com/phpless/cli/internal/api"
	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

var (
	jsonFlag   bool
	apiURLFlag string
)

// NewRootCmd creates the root cobra command with all subcommands.
func NewRootCmd(version string) *cobra.Command {
	rootCmd := &cobra.Command{
		Use:   "phpless",
		Short: "PHPless CLI — deploy and manage PHP apps",
		Long:  "PHPless CLI tool for deploying and managing PHP applications on the PHPless platform.",
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			ui.JSONMode = jsonFlag
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	rootCmd.PersistentFlags().BoolVar(&jsonFlag, "json", false, "Output in JSON format")
	rootCmd.PersistentFlags().StringVar(&apiURLFlag, "api-url", "", "Override API base URL")

	rootCmd.AddCommand(newLoginCmd())
	rootCmd.AddCommand(newWhoamiCmd())
	rootCmd.AddCommand(newAppsCmd())
	rootCmd.AddCommand(newDeployCmd())
	rootCmd.AddCommand(newPullCmd())
	rootCmd.AddCommand(newLogsCmd())
	rootCmd.AddCommand(newEnvCmd())
	rootCmd.AddCommand(newFilesCmd())
	rootCmd.AddCommand(newStorageCmd())
	rootCmd.AddCommand(newInfoCmd())
	rootCmd.AddCommand(newExecCmd())
	rootCmd.AddCommand(newInitCmd())
	rootCmd.AddCommand(newMCPCmd(version))

	rootCmd.Version = version

	return rootCmd
}

// requireAuth loads config and returns an authenticated API client.
func requireAuth() (*api.Client, error) {
	cfg, err := config.LoadGlobal()
	if err != nil {
		return nil, err
	}

	if cfg.Token == "" {
		return nil, fmt.Errorf("not logged in. Run 'phpless login' first")
	}

	baseURL := cfg.APIURL
	if apiURLFlag != "" {
		baseURL = apiURLFlag
	}

	return api.NewClient(baseURL, cfg.Token), nil
}

// handleAPIError prints a user-friendly error message and exits.
func handleAPIError(err error) {
	if apiErr, ok := err.(*api.APIError); ok {
		if apiErr.StatusCode == 401 {
			ui.Error("Session expired. Run 'phpless login' to re-authenticate.")
			os.Exit(1)
		}
	}
	ui.Error("%s", err)
	os.Exit(1)
}
