package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newStatusCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "status",
		Short: "Show health status and uptime for the current app",
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				ui.Error("No app found. Use --app or run 'phpless init' in your project directory.")
				os.Exit(1)
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			resp, err := client.GetUptime(slug)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			if ui.JSONMode {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(resp)
			}

			if !resp.HealthCheckEnabled {
				ui.Info("Health checks are not enabled for %s.", slug)
				ui.Info("Enable them in the panel Settings tab or via the API.")
				return nil
			}

			status := "Unknown"
			if resp.IsUp != nil {
				if *resp.IsUp {
					status = "UP"
				} else {
					status = "DOWN"
				}
			}

			ui.Bold("App: %s", slug)
			fmt.Printf("  Status:  %s\n", status)

			if resp.LastCheck != nil {
				fmt.Printf("  Last:    HTTP %d / %dms (at %s)\n",
					resp.LastCheck.StatusCode,
					resp.LastCheck.ResponseTimeMs,
					resp.LastCheck.CheckedAt)
			}

			if resp.Uptime24h != nil {
				fmt.Printf("  24h:     %.1f%% uptime", *resp.Uptime24h)
				if resp.AvgResponseTime24h != nil {
					fmt.Printf(" (avg %dms)", *resp.AvgResponseTime24h)
				}
				fmt.Println()
			}
			if resp.Uptime7d != nil {
				fmt.Printf("  7d:      %.1f%% uptime\n", *resp.Uptime7d)
			}
			if resp.Uptime30d != nil {
				fmt.Printf("  30d:     %.1f%% uptime\n", *resp.Uptime30d)
			}

			return nil
		},
	}

	cmd.Flags().StringVarP(&appSlug, "app", "a", "", "App slug (defaults to .phpless.toml)")

	return cmd
}
