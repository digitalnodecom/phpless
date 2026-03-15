package sshutil

import (
	"bytes"
	"fmt"
	"net"
	"strings"

	"github.com/phpless/cli/internal/config"
	"golang.org/x/crypto/ssh"
)

const ProxyPort = "7068"

// ProxyHost extracts the hostname from the API URL for the SSH proxy.
func ProxyHost(apiURL string) string {
	host := apiURL
	if i := strings.Index(host, "://"); i >= 0 {
		host = host[i+3:]
	}
	if i := strings.Index(host, "/"); i >= 0 {
		host = host[:i]
	}
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return host
}

// ProxyAddr returns host:port for the SSH proxy.
func ProxyAddr(apiURL string) string {
	return ProxyHost(apiURL) + ":" + ProxyPort
}

// Dial connects to the SSH proxy and returns an authenticated client.
func Dial(slug string) (*ssh.Client, error) {
	cfg, err := config.LoadGlobal()
	if err != nil || cfg.Token == "" {
		return nil, fmt.Errorf("not authenticated — run 'phpless login' first")
	}

	sshConfig := &ssh.ClientConfig{
		User:            slug,
		Auth:            []ssh.AuthMethod{ssh.Password(cfg.Token)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec
	}

	client, err := ssh.Dial("tcp", ProxyAddr(cfg.APIURL), sshConfig)
	if err != nil {
		if strings.Contains(err.Error(), "unable to authenticate") {
			return nil, fmt.Errorf("authentication failed — check your app slug and login status")
		}
		return nil, fmt.Errorf("connection failed: %w", err)
	}
	return client, nil
}

// ExecResult holds the output of a remote command execution.
type ExecResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}

// RunCommand connects to the SSH proxy and runs a command non-interactively.
func RunCommand(slug, command string) (*ExecResult, error) {
	client, err := Dial(slug)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to open session: %w", err)
	}
	defer session.Close()

	var stdoutBuf, stderrBuf bytes.Buffer
	session.Stdout = &stdoutBuf
	session.Stderr = &stderrBuf

	err = session.Run(command)

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*ssh.ExitError); ok {
			exitCode = exitErr.ExitStatus()
		} else {
			return nil, fmt.Errorf("command failed: %w", err)
		}
	}

	return &ExecResult{
		Stdout:   stdoutBuf.String(),
		Stderr:   stderrBuf.String(),
		ExitCode: exitCode,
	}, nil
}
