package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"

	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newPreviewsCmd() *cobra.Command {
	previewsCmd := &cobra.Command{
		Use:   "previews",
		Short: "Manage preview environments",
		RunE: func(cmd *cobra.Command, args []string) error {
			// Default to list
			return newPreviewsListCmd().RunE(cmd, args)
		},
	}

	previewsCmd.AddCommand(newPreviewsListCmd())
	previewsCmd.AddCommand(newPreviewsDestroyCmd())

	return previewsCmd
}

func newPreviewsListCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List active preview environments",
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

			resp, err := client.ListPreviews(slug)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			if ui.JSONMode {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(resp)
			}

			if len(resp.Previews) == 0 {
				ui.Info("No preview environments. Push to a non-default branch to create one.")
				return nil
			}

			rows := make([][]string, len(resp.Previews))
			for i, p := range resp.Previews {
				shortSha := ""
				if len(p.CommitSHA) >= 7 {
					shortSha = p.CommitSHA[:7]
				}
				rows[i] = []string{
					strconv.Itoa(p.ID),
					p.Branch,
					p.VMState,
					shortSha,
					p.URL,
					p.ExpiresAt,
				}
			}
			ui.Table([]string{"ID", "BRANCH", "STATE", "COMMIT", "URL", "EXPIRES"}, rows)

			return nil
		},
	}

	cmd.Flags().StringVarP(&appSlug, "app", "a", "", "App slug (defaults to .phpless.toml)")

	return cmd
}

func newPreviewsDestroyCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "destroy <id>",
		Short: "Destroy a preview environment",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				ui.Error("No app found. Use --app or run 'phpless init' in your project directory.")
				os.Exit(1)
			}

			previewID, err := strconv.Atoi(args[0])
			if err != nil {
				ui.Error("Invalid preview ID: %s", args[0])
				return nil
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			spin := ui.NewSpinner(fmt.Sprintf("Destroying preview %d...", previewID))
			spin.Start()
			resp, err := client.DestroyPreview(slug, previewID)
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

			ui.Success("%s", resp.Message)
			return nil
		},
	}

	cmd.Flags().StringVarP(&appSlug, "app", "a", "", "App slug (defaults to .phpless.toml)")

	return cmd
}
