package cmd

import (
	"github.com/phpless/cli/internal/api"
	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newLoginCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "login",
		Short: "Log in to PHPless",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := config.LoadGlobal()
			if err != nil {
				return err
			}

			baseURL := cfg.APIURL
			if apiURLFlag != "" {
				baseURL = apiURLFlag
			}

			ui.Bold("Log in to PHPless")
			ui.Info("")

			email, err := ui.Prompt("Email: ")
			if err != nil {
				return err
			}

			password, err := ui.PromptPassword("Password: ")
			if err != nil {
				return err
			}

			client := api.NewClient(baseURL, "")
			resp, err := client.Login(email, password)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			cfg.Token = resp.Token
			if err := config.SaveGlobal(cfg); err != nil {
				return err
			}

			ui.Success("Logged in as %s (%s)", resp.User.Name, resp.User.Email)
			return nil
		},
	}
}
