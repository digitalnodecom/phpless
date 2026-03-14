package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newInfoCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "info",
		Short: "Show info about the current app",
		Long:  "Shows details for the app linked in .phpless.toml (or specified via --app).",
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				ui.Error("No app found. Use --app or run 'phpless init' in your project directory.")
				os.Exit(1)
			}

			client, err := requireAuth()
			if err != nil {
				handleAPIError(err)
				return nil
			}

			resp, err := client.GetApp(slug)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			app := resp.App

			if ui.JSONMode {
				json.NewEncoder(os.Stdout).Encode(resp)
				return nil
			}

			ui.Bold("%s", app.Name)
			fmt.Println()

			rows := [][]string{
				{"Slug", app.Slug},
				{"URL", app.URL},
				{"VM State", app.VMState},
				{"vCPUs", fmt.Sprintf("%d", app.VCPUs)},
				{"Memory", fmt.Sprintf("%d MiB", app.MemMiB)},
				{"Created", app.CreatedAt},
			}

			if app.PHPVersion != "" {
				rows = append(rows, []string{"PHP Version", app.PHPVersion})
			}
			if app.GithubRepo != "" {
				rows = append(rows, []string{"GitHub Repo", app.GithubRepo})
			}
			if app.GithubBranch != "" {
				rows = append(rows, []string{"GitHub Branch", app.GithubBranch})
			}

			for _, row := range rows {
				fmt.Printf("  %-14s %s\n", row[0]+":", row[1])
			}

			if len(app.Domains) > 0 {
				fmt.Println()
				ui.Bold("Domains")
				for _, d := range app.Domains {
					ssl := ""
					if d.SSLActive {
						ssl = " (SSL)"
					}
					fmt.Printf("  %s [%s]%s\n", d.Domain, d.Type, ssl)
				}
			}

			if len(app.Deployments) > 0 {
				fmt.Println()
				ui.Bold("Recent Deployments")
				for _, d := range app.Deployments {
					fmt.Printf("  %s  %-10s  %s\n", d.CreatedAt, d.Status, d.CommitMessage)
				}
			}

			return nil
		},
	}

	cmd.Flags().StringVarP(&appSlug, "app", "a", "", "App slug (defaults to .phpless.toml)")

	return cmd
}
