package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newLogsCmd() *cobra.Command {
	var appSlug string
	var follow bool
	var search string
	var status string
	var since string
	var limit int
	var offset int

	cmd := &cobra.Command{
		Use:   "logs",
		Short: "Show recent access logs",
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			if follow {
				return streamLogs(slug)
			}

			// Use search API if any search filters are set
			if search != "" || status != "" || since != "" {
				resp, err := client.SearchLogs(slug, search, status, since, limit, offset)
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
					ui.Info("No logs found matching filters for '%s'.", slug)
					return nil
				}

				rows := make([][]string, len(resp.Logs))
				for i, log := range resp.Logs {
					rows[i] = []string{
						log.LoggedAt,
						log.Method,
						log.Path,
						fmt.Sprintf("%d", log.StatusCode),
						fmt.Sprintf("%dms", log.DurationMs),
						log.IP,
					}
				}
				ui.Table([]string{"TIME", "METHOD", "PATH", "STATUS", "DURATION", "IP"}, rows)

				if resp.Total > 0 {
					ui.Info("Showing %d-%d of %d results (page %d/%d)",
						(resp.Page-1)*resp.PerPage+1,
						min((resp.Page)*resp.PerPage, resp.Total),
						resp.Total, resp.Page, resp.LastPage)
				}

				return nil
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

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")
	cmd.Flags().BoolVarP(&follow, "follow", "f", false, "Stream logs in real time")
	cmd.Flags().StringVarP(&search, "search", "s", "", "Search path text")
	cmd.Flags().StringVar(&status, "status", "", "Filter by status code (e.g., 500, 5xx)")
	cmd.Flags().StringVar(&since, "since", "", "Time range (e.g., 1h, 24h, 7d)")
	cmd.Flags().IntVar(&limit, "limit", 50, "Results per page")
	cmd.Flags().IntVar(&offset, "offset", 0, "Page offset (page number)")

	return cmd
}

// streamLogs connects to the WebSocket log stream and prints lines as they arrive.
func streamLogs(slug string) error {
	client, err := requireAuth()
	if err != nil {
		return err
	}

	// Create a log stream session via the API
	sess, err := client.CreateLogStreamSession(slug)
	if err != nil {
		handleAPIError(err)
		return nil
	}

	// Derive WebSocket URL from the API base URL
	// API URL: https://host/api/v1 → wss://host/ws/logs/{session_id}
	cfg, _ := config.LoadGlobal()
	apiURL := config.DefaultAPIURL
	if cfg != nil && cfg.APIURL != "" {
		apiURL = cfg.APIURL
	}

	parsed, err := url.Parse(apiURL)
	if err != nil {
		return fmt.Errorf("invalid API URL: %w", err)
	}

	scheme := "wss"
	if parsed.Scheme == "http" {
		scheme = "ws"
	}
	wsURL := fmt.Sprintf("%s://%s/ws/logs/%s", scheme, parsed.Host, sess.SessionID)

	// Connect with auth header
	headers := http.Header{}
	dialer := websocket.DefaultDialer

	conn, _, err := dialer.Dial(wsURL, headers)
	if err != nil {
		return fmt.Errorf("failed to connect to log stream: %w", err)
	}
	defer conn.Close()

	ui.Info("Streaming logs for '%s'... (Ctrl+C to stop)", slug)

	// Handle Ctrl+C
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				return
			}
			line := strings.TrimSpace(string(message))
			if line == "" {
				continue
			}

			// Try to parse as Caddy JSON log and format nicely
			if !ui.JSONMode {
				if formatted := formatCaddyLog(line); formatted != "" {
					fmt.Println(formatted)
					continue
				}
			}
			fmt.Println(line)
		}
	}()

	select {
	case <-done:
		return nil
	case <-interrupt:
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "")) //nolint:errcheck
		return nil
	}
}

// formatCaddyLog parses a Caddy JSON log line and returns a human-readable string.
func formatCaddyLog(line string) string {
	var entry map[string]any
	if err := json.Unmarshal([]byte(line), &entry); err != nil {
		return ""
	}

	ts, _ := entry["ts"].(float64)
	if ts == 0 {
		return ""
	}

	status := 0
	if s, ok := entry["status"].(float64); ok {
		status = int(s)
	}

	duration := 0.0
	if d, ok := entry["duration"].(float64); ok {
		duration = d * 1000 // convert to ms
	}

	size := 0
	if s, ok := entry["size"].(float64); ok {
		size = int(s)
	}

	request, _ := entry["request"].(map[string]any)
	method, _ := request["method"].(string)
	path, _ := request["uri"].(string)
	clientIP, _ := request["client_ip"].(string)
	if clientIP == "" {
		clientIP, _ = request["remote_ip"].(string)
	}

	return fmt.Sprintf("%d %s %s %.1fms %dB %s", status, method, path, duration, size, clientIP)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
