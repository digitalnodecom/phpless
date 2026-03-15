package cmd

import (
	"os"
	"os/signal"
	"syscall"

	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/sshutil"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
	"golang.org/x/crypto/ssh"
	"golang.org/x/term"
)

func newSSHCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "ssh [--app <slug>]",
		Short: "SSH into the app's VM",
		Long: `Open an interactive SSH session into the app's Firecracker microVM.

Connects through the PHPless SSH proxy using your API token for authentication.

Examples:
  phpless ssh --app my-app
  phpless ssh`,
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				ui.Error("No app specified. Use --app or create a .phpless.toml with 'phpless init'.")
				os.Exit(1)
			}

			cfg, err := config.LoadGlobal()
			if err != nil || cfg.Token == "" {
				ui.Error("Not logged in. Run 'phpless login' first.")
				os.Exit(1)
			}

			host := sshutil.ProxyHost(cfg.APIURL)
			ui.Dim("Connecting to %s via %s:%s...", slug, host, sshutil.ProxyPort)

			conn, err := sshutil.Dial(slug)
			if err != nil {
				ui.Error("%s", err)
				os.Exit(1)
			}
			defer conn.Close()

			session, err := conn.NewSession()
			if err != nil {
				ui.Error("Failed to open session: %s", err)
				os.Exit(1)
			}
			defer session.Close()

			// Put terminal into raw mode
			fd := int(os.Stdin.Fd())
			if term.IsTerminal(fd) {
				oldState, err := term.MakeRaw(fd)
				if err != nil {
					ui.Error("Failed to set raw terminal: %s", err)
					os.Exit(1)
				}
				defer term.Restore(fd, oldState)
			}

			// Get terminal size
			w, h, _ := term.GetSize(fd)
			if w == 0 {
				w = 80
			}
			if h == 0 {
				h = 24
			}

			// Request PTY
			modes := ssh.TerminalModes{
				ssh.ECHO:          1,
				ssh.TTY_OP_ISPEED: 14400,
				ssh.TTY_OP_OSPEED: 14400,
			}
			if err := session.RequestPty("xterm-256color", h, w, modes); err != nil {
				ui.Error("PTY request failed: %s", err)
				os.Exit(1)
			}

			session.Stdin = os.Stdin
			session.Stdout = os.Stdout
			session.Stderr = os.Stderr

			// Handle window resize
			sigWinch := make(chan os.Signal, 1)
			signal.Notify(sigWinch, syscall.SIGWINCH)
			go func() {
				for range sigWinch {
					if nw, nh, err := term.GetSize(fd); err == nil {
						session.WindowChange(nh, nw) //nolint:errcheck
					}
				}
			}()

			if err := session.Shell(); err != nil {
				ui.Error("Shell failed: %s", err)
				os.Exit(1)
			}

			session.Wait() //nolint:errcheck
			return nil
		},
	}

	cmd.Flags().StringVarP(&appSlug, "app", "a", "", "App slug")

	return cmd
}
