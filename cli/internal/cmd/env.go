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

func newEnvCmd() *cobra.Command {
	envCmd := &cobra.Command{
		Use:   "env",
		Short: "Manage environment variables",
	}

	envCmd.AddCommand(newEnvListCmd())
	envCmd.AddCommand(newEnvSetCmd())
	envCmd.AddCommand(newEnvUnsetCmd())

	return envCmd
}

func newEnvListCmd() *cobra.Command {
	var appSlug string
	var team bool

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List environment variables",
		RunE: func(cmd *cobra.Command, args []string) error {
			client, err := requireAuth()
			if err != nil {
				return err
			}

			if team {
				resp, err := client.ListTeamEnv()
				if err != nil {
					handleAPIError(err)
					return nil
				}

				if ui.JSONMode {
					enc := json.NewEncoder(os.Stdout)
					enc.SetIndent("", "  ")
					return enc.Encode(resp)
				}

				if len(resp.Vars) == 0 {
					ui.Info("No team environment variables set.")
					return nil
				}

				rows := make([][]string, len(resp.Vars))
				for i, v := range resp.Vars {
					rows[i] = []string{v.Key, v.Value}
				}
				ui.Table([]string{"KEY", "VALUE"}, rows)
				return nil
			}

			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			resp, err := client.ListAppEnv(slug)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			if ui.JSONMode {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(resp)
			}

			if len(resp.Vars) == 0 {
				ui.Info("No environment variables set for '%s'.", slug)
				return nil
			}

			rows := make([][]string, len(resp.Vars))
			for i, v := range resp.Vars {
				rows[i] = []string{v.Key, v.Value, v.Source}
			}
			ui.Table([]string{"KEY", "VALUE", "SOURCE"}, rows)

			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")
	cmd.Flags().BoolVar(&team, "team", false, "List team-level variables")

	return cmd
}

func newEnvSetCmd() *cobra.Command {
	var appSlug string
	var team bool

	cmd := &cobra.Command{
		Use:   "set KEY=VALUE...",
		Short: "Set environment variables",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			vars := make(map[string]string)
			for _, arg := range args {
				parts := strings.SplitN(arg, "=", 2)
				if len(parts) != 2 {
					return fmt.Errorf("invalid format: %q (expected KEY=VALUE)", arg)
				}
				vars[parts[0]] = parts[1]
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			if team {
				_, err := client.SetTeamEnv(vars)
				if err != nil {
					handleAPIError(err)
					return nil
				}
				ui.Success("Team environment variables updated.")
				return nil
			}

			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			_, err = client.SetAppEnv(slug, vars)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			ui.Success("Environment variables updated for '%s'.", slug)
			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")
	cmd.Flags().BoolVar(&team, "team", false, "Set team-level variables")

	return cmd
}

func newEnvUnsetCmd() *cobra.Command {
	var appSlug string
	var team bool

	cmd := &cobra.Command{
		Use:   "unset <KEY>",
		Short: "Delete an environment variable",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			key := args[0]

			client, err := requireAuth()
			if err != nil {
				return err
			}

			if team {
				_, err := client.DeleteTeamEnv(key)
				if err != nil {
					handleAPIError(err)
					return nil
				}
				ui.Success("Deleted team variable '%s'.", key)
				return nil
			}

			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			_, err = client.DeleteAppEnv(slug, key)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			ui.Success("Deleted variable '%s' from '%s'.", key, slug)
			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")
	cmd.Flags().BoolVar(&team, "team", false, "Delete team-level variable")

	return cmd
}
