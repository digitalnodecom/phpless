package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/phpless/cli/internal/api"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newAppsCmd() *cobra.Command {
	appsCmd := &cobra.Command{
		Use:   "apps",
		Short: "Manage apps",
	}

	appsCmd.AddCommand(newAppsListCmd())
	appsCmd.AddCommand(newAppsCreateCmd())
	appsCmd.AddCommand(newAppsInfoCmd())
	appsCmd.AddCommand(newAppsDeleteCmd())

	return appsCmd
}

func newAppsListCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List all apps",
		RunE: func(cmd *cobra.Command, args []string) error {
			client, err := requireAuth()
			if err != nil {
				return err
			}

			resp, err := client.ListApps()
			if err != nil {
				handleAPIError(err)
				return nil
			}

			if ui.JSONMode {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(resp)
			}

			if len(resp.Apps) == 0 {
				ui.Info("No apps found. Create one with 'phpless apps create <name>'.")
				return nil
			}

			rows := make([][]string, len(resp.Apps))
			for i, app := range resp.Apps {
				rows[i] = []string{app.Slug, app.VMState, app.URL}
			}
			ui.Table([]string{"SLUG", "STATE", "URL"}, rows)

			return nil
		},
	}
}

func newAppsCreateCmd() *cobra.Command {
	var slug string
	var vcpus int
	var memMiB int

	cmd := &cobra.Command{
		Use:   "create <name>",
		Short: "Create a new app",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, err := requireAuth()
			if err != nil {
				return err
			}

			req := &api.CreateAppRequest{
				Name: args[0],
			}
			if slug != "" {
				req.Slug = slug
			}
			if vcpus > 0 {
				req.VCPUs = vcpus
			}
			if memMiB > 0 {
				req.MemMiB = memMiB
			}

			spin := ui.NewSpinner("Creating app...")
			spin.Start()
			resp, err := client.CreateApp(req)
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

			ui.Success("App created: %s", resp.App.Slug)
			fmt.Printf("  URL:   %s\n", resp.App.URL)
			fmt.Printf("  State: %s\n", resp.App.VMState)

			return nil
		},
	}

	cmd.Flags().StringVar(&slug, "slug", "", "Custom slug for the app")
	cmd.Flags().IntVar(&vcpus, "vcpus", 0, "Number of vCPUs (1 or 2)")
	cmd.Flags().IntVar(&memMiB, "mem", 0, "Memory in MiB (128, 256, 512, 1024)")

	return cmd
}

func newAppsInfoCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "info <slug>",
		Short: "Show detailed app info",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, err := requireAuth()
			if err != nil {
				return err
			}

			resp, err := client.GetApp(args[0])
			if err != nil {
				handleAPIError(err)
				return nil
			}

			if ui.JSONMode {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(resp)
			}

			app := resp.App
			ui.Bold("App: %s", app.Name)
			fmt.Printf("  Slug:    %s\n", app.Slug)
			fmt.Printf("  URL:     %s\n", app.URL)
			fmt.Printf("  State:   %s\n", app.VMState)
			fmt.Printf("  vCPUs:   %d\n", app.VCPUs)
			fmt.Printf("  Memory:  %d MiB\n", app.MemMiB)
			if app.PHPVersion != "" {
				fmt.Printf("  PHP:     %s\n", app.PHPVersion)
			}
			if app.GithubRepo != "" {
				fmt.Printf("  Repo:    %s\n", app.GithubRepo)
				fmt.Printf("  Branch:  %s\n", app.GithubBranch)
			}

			if len(app.Domains) > 0 {
				fmt.Println()
				ui.Bold("Domains")
				rows := make([][]string, len(app.Domains))
				for i, d := range app.Domains {
					ssl := "no"
					if d.SSLActive {
						ssl = "yes"
					}
					rows[i] = []string{d.Domain, d.Type, ssl}
				}
				ui.Table([]string{"DOMAIN", "TYPE", "SSL"}, rows)
			}

			if len(app.Deployments) > 0 {
				fmt.Println()
				ui.Bold("Recent Deployments")
				rows := make([][]string, len(app.Deployments))
				for i, d := range app.Deployments {
					msg := d.CommitMessage
					if len(msg) > 40 {
						msg = msg[:37] + "..."
					}
					rows[i] = []string{fmt.Sprintf("#%d", d.ID), d.Status, msg, d.CreatedAt}
				}
				ui.Table([]string{"ID", "STATUS", "MESSAGE", "CREATED"}, rows)
			}

			return nil
		},
	}
}

func newAppsDeleteCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "delete <slug>",
		Short: "Delete an app",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug := args[0]

			if !ui.Confirm(fmt.Sprintf("Are you sure you want to delete app '%s'?", slug)) {
				ui.Info("Cancelled.")
				return nil
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			spin := ui.NewSpinner("Deleting app...")
			spin.Start()
			_, err = client.DeleteApp(slug)
			spin.Stop()

			if err != nil {
				handleAPIError(err)
				return nil
			}

			ui.Success("App '%s' deleted.", slug)
			return nil
		},
	}
}
