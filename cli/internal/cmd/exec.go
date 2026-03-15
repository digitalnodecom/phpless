package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/sshutil"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newExecCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "exec [--app <slug>] -- <command...>",
		Short: "Execute a command inside the app's VM",
		Long: `Execute a shell command inside the app's Firecracker microVM via SSH.

The command runs as root inside the VM and returns stdout, stderr, and exit code.
The CLI exits with the same exit code as the remote command.

Examples:
  phpless exec --app my-app -- ls -la /app
  phpless exec -- php artisan migrate
  phpless exec -- composer install`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				ui.Error("No app specified. Use --app or create a .phpless.toml with 'phpless init'.")
				os.Exit(1)
			}

			command := strings.Join(args, " ")

			if !ui.JSONMode {
				ui.Dim("Executing on %s: %s", slug, command)
			}

			result, err := sshutil.RunCommand(slug, command)
			if err != nil {
				ui.Error("%s", err)
				os.Exit(1)
			}

			if ui.JSONMode {
				json.NewEncoder(os.Stdout).Encode(result)
			} else {
				if result.Stdout != "" {
					fmt.Fprint(os.Stdout, result.Stdout)
				}
				if result.Stderr != "" {
					fmt.Fprint(os.Stderr, result.Stderr)
				}
			}

			if result.ExitCode != 0 {
				os.Exit(result.ExitCode)
			}

			return nil
		},
	}

	cmd.Flags().StringVarP(&appSlug, "app", "a", "", "App slug")

	return cmd
}
