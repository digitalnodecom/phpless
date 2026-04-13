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

func newRollbackCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "rollback [deployment-id]",
		Short: "Rollback to a previous deployment",
		Long: `Rollback an app to a previous deployment. If no deployment ID is given,
rolls back to the most recent successful deployment before the current one.

Use 'phpless apps info <slug>' to see recent deployment IDs.`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			var deploymentID int

			if len(args) > 0 {
				deploymentID, err = strconv.Atoi(args[0])
				if err != nil {
					return fmt.Errorf("invalid deployment ID: %s", args[0])
				}
			} else {
				// Find the previous successful deployment by listing app details
				appResp, err := client.GetApp(slug)
				if err != nil {
					handleAPIError(err)
					return nil
				}

				// Skip the first succeeded deployment (current), pick the next one
				found := false
				skippedCurrent := false
				for _, d := range appResp.App.Deployments {
					if d.Status == "succeeded" {
						if !skippedCurrent {
							skippedCurrent = true
							continue
						}
						deploymentID = d.ID
						found = true
						break
					}
				}

				if !found {
					ui.Error("No previous deployment to rollback to.")
					return nil
				}

				ui.Info("Rolling back %s to deployment #%d...", slug, deploymentID)
			}

			spin := ui.NewSpinner("Rolling back...")
			spin.Start()
			resp, err := client.Rollback(slug, deploymentID)
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

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")

	return cmd
}
