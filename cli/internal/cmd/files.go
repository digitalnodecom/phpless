package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newFilesCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "files",
		Short: "List deployed files for an app",
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			resp, err := client.ListFiles(slug)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			if ui.JSONMode {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(resp)
			}

			if len(resp.Files) == 0 {
				ui.Info("No files deployed for '%s'.", slug)
				return nil
			}

			rows := make([][]string, len(resp.Files))
			for i, f := range resp.Files {
				rows[i] = []string{f.Path, formatSize(f.Size), f.ModifiedAt}
			}

			ui.Table([]string{"Path", "Size", "Modified"}, rows)
			fmt.Printf("\n%d files total\n", resp.Total)

			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")

	return cmd
}

func formatSize(bytes int64) string {
	if bytes == 0 {
		return "0 B"
	}
	const k = 1024
	sizes := []string{"B", "KB", "MB", "GB"}
	i := 0
	b := float64(bytes)
	for b >= float64(k) && i < len(sizes)-1 {
		b /= float64(k)
		i++
	}
	if i == 0 {
		return fmt.Sprintf("%d B", bytes)
	}
	return fmt.Sprintf("%.1f %s", b, sizes[i])
}
