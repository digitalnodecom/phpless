package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newLogsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "logs <slug>",
		Short: "Show recent access logs",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug := args[0]

			client, err := requireAuth()
			if err != nil {
				return err
			}

			resp, err := client.GetLogs(slug)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			if ui.JSONMode {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(resp)
			}

			if len(resp.Logs) == 0 {
				ui.Info("No logs found for '%s'.", slug)
				return nil
			}

			rows := make([][]string, len(resp.Logs))
			for i, log := range resp.Logs {
				rows[i] = []string{
					log.Timestamp,
					log.Method,
					log.Path,
					fmt.Sprintf("%d", log.Status),
					fmt.Sprintf("%.1fms", log.Duration),
					log.ClientIP,
				}
			}
			ui.Table([]string{"TIME", "METHOD", "PATH", "STATUS", "DURATION", "IP"}, rows)

			return nil
		},
	}
}
