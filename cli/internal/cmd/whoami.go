package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newWhoamiCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "Show current user and team info",
		RunE: func(cmd *cobra.Command, args []string) error {
			client, err := requireAuth()
			if err != nil {
				return err
			}

			userResp, err := client.GetUser()
			if err != nil {
				handleAPIError(err)
				return nil
			}

			teamResp, err := client.GetTeam()
			if err != nil {
				handleAPIError(err)
				return nil
			}

			if ui.JSONMode {
				out := map[string]any{
					"user": userResp.User,
					"team": teamResp.Team,
				}
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(out)
			}

			ui.Bold("User")
			fmt.Printf("  Name:  %s\n", userResp.User.Name)
			fmt.Printf("  Email: %s\n", userResp.User.Email)
			fmt.Println()
			ui.Bold("Team")
			fmt.Printf("  Name: %s\n", teamResp.Team.Name)
			fmt.Printf("  Slug: %s\n", teamResp.Team.Slug)
			fmt.Printf("  Plan: %s\n", teamResp.Team.Plan)
			fmt.Printf("  Apps: %d / %d\n", teamResp.Team.AppCount, teamResp.Team.AppLimit)

			return nil
		},
	}
}
