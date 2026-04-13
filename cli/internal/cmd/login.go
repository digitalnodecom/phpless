package cmd

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/phpless/cli/internal/api"
	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newLoginCmd() *cobra.Command {
	var interactive bool

	cmd := &cobra.Command{
		Use:   "login",
		Short: "Log in to PHPless",
		RunE: func(cmd *cobra.Command, args []string) error {
			if interactive {
				return loginInteractive()
			}
			return loginBrowser()
		},
	}

	cmd.Flags().BoolVarP(&interactive, "interactive", "i", false, "Use email/password prompt instead of browser")

	return cmd
}

func loginBrowser() error {
	cfg, err := config.LoadGlobal()
	if err != nil {
		return err
	}

	baseURL := cfg.APIURL
	if apiURLFlag != "" {
		baseURL = apiURLFlag
	}

	// Derive the panel URL from the API URL (strip /api/v1 suffix)
	panelURL := baseURL
	if len(panelURL) > 7 && panelURL[len(panelURL)-7:] == "/api/v1" {
		panelURL = panelURL[:len(panelURL)-7]
	}

	// Generate random state token
	stateBytes := make([]byte, 20)
	if _, err := rand.Read(stateBytes); err != nil {
		return fmt.Errorf("failed to generate state token: %w", err)
	}
	state := hex.EncodeToString(stateBytes)

	// Start local callback server on a random port, bound to 127.0.0.1 only
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("failed to start local server: %w", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port

	type callbackResult struct {
		token string
		state string
		email string
		name  string
	}

	resultCh := make(chan callbackResult, 1)
	errCh := make(chan error, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		cbState := r.URL.Query().Get("state")
		cbToken := r.URL.Query().Get("token")
		cbEmail := r.URL.Query().Get("email")
		cbName := r.URL.Query().Get("name")

		if cbState != state {
			http.Error(w, "Invalid state parameter", http.StatusBadRequest)
			errCh <- fmt.Errorf("state mismatch — possible CSRF attack")
			return
		}

		if cbToken == "" {
			http.Error(w, "Missing token", http.StatusBadRequest)
			errCh <- fmt.Errorf("no token received from server")
			return
		}

		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>PHPless CLI</title></head><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Logged in!</h2><p>You can close this window and return to your terminal.</p></body></html>`)

		resultCh <- callbackResult{
			token: cbToken,
			state: cbState,
			email: cbEmail,
			name:  cbName,
		}
	})

	server := &http.Server{Handler: mux}

	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			errCh <- fmt.Errorf("local server error: %w", err)
		}
	}()

	authURL := fmt.Sprintf("%s/auth/cli?port=%d&state=%s", panelURL, port, state)

	ui.Bold("Log in to PHPless")
	ui.Info("")

	// Try to open browser
	if err := openBrowser(authURL); err != nil {
		ui.Warn("Could not open browser automatically.")
	} else {
		ui.Info("Opening browser to log in...")
	}
	ui.Info("If the browser didn't open, visit this URL:")
	ui.Info("")
	ui.Bold("  %s", authURL)
	ui.Info("")

	spinner := ui.NewSpinner("Waiting for login...")
	spinner.Start()

	// Wait for callback with 2-minute timeout
	timeout := time.After(2 * time.Minute)
	var result callbackResult

	select {
	case result = <-resultCh:
		// success
	case err := <-errCh:
		spinner.Stop()
		_ = server.Shutdown(context.Background())
		return err
	case <-timeout:
		spinner.Stop()
		_ = server.Shutdown(context.Background())
		ui.Error("Login timed out after 2 minutes.")
		ui.Info("Try again or use: phpless login --interactive")
		return fmt.Errorf("login timed out")
	}

	spinner.Stop()
	_ = server.Shutdown(context.Background())

	// Save token
	cfg.Token = result.token
	if err := config.SaveGlobal(cfg); err != nil {
		return err
	}

	displayName := result.email
	if result.name != "" {
		displayName = fmt.Sprintf("%s (%s)", result.name, result.email)
	}
	ui.Success("Logged in as %s", displayName)

	return nil
}

func loginInteractive() error {
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
}

