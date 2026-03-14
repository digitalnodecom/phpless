package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newExecCmd() *cobra.Command {
	var appSlug string
	var timeout int

	cmd := &cobra.Command{
		Use:   "exec [--app <slug>] -- <command...>",
		Short: "Execute a command inside the app's VM",
		Long: `Execute a shell command inside the app's Firecracker microVM via SSH.

The command runs as root inside the VM and returns stdout, stderr, and exit code.
The CLI exits with the same exit code as the remote command.

Examples:
  phpless exec --app my-app -- ls -la /app
  phpless exec -- php artisan migrate
  phpless exec -t 120 -- composer install`,
		Args:               cobra.MinimumNArgs(1),
		DisableFlagParsing: false,
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				ui.Error("No app specified. Use --app or create a .phpless.toml with 'phpless init'.")
				os.Exit(1)
			}

			client, err := requireAuth()
			if err != nil {
				handleAPIError(err)
				return nil
			}

			command := strings.Join(args, " ")

			if !ui.JSONMode {
				ui.Dim("Executing on %s: %s", slug, command)
			}

			resp, err := client.ExecCommand(slug, command, timeout)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			if ui.JSONMode {
				json.NewEncoder(os.Stdout).Encode(resp)
			} else {
				if resp.Stdout != "" {
					fmt.Fprint(os.Stdout, resp.Stdout)
				}
				if resp.Stderr != "" {
					fmt.Fprint(os.Stderr, resp.Stderr)
				}
			}

			if resp.ExitCode != 0 {
				os.Exit(resp.ExitCode)
			}

			return nil
		},
	}

	cmd.Flags().StringVarP(&appSlug, "app", "a", "", "App slug")
	cmd.Flags().IntVarP(&timeout, "timeout", "t", 30, "Command timeout in seconds (max 300)")

	return cmd
}
