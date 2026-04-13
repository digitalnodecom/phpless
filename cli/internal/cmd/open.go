package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"

	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newOpenCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "open",
		Short: "Open the app in your browser",
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			resp, err := client.GetApp(slug)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			url := resp.App.URL
			if url == "" {
				url = fmt.Sprintf("https://%s.phpless.app", slug)
			}

			if ui.JSONMode {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(map[string]string{"url": url})
			}

			ui.Info("Opening %s", url)

			if err := openBrowser(url); err != nil {
				ui.Warn("Could not open browser: %s", err)
				ui.Info("Visit: %s", url)
			}

			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")

	return cmd
}

// openBrowser opens the given URL in the default browser.
func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	case "linux":
		return exec.Command("xdg-open", url).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	default:
		return fmt.Errorf("unsupported platform")
	}
}
