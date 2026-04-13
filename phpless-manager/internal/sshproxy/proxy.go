package sshproxy

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"
	"golang.org/x/crypto/ssh"
)

// Config for the SSH proxy server.
type Config struct {
	// ListenAddr is the TCP address to listen on (e.g. "0.0.0.0:7068")
	ListenAddr string
	// HostKey is the SSH host key signer for the proxy server
	HostKey ssh.Signer
	// VMSigner is the SSH key used to connect to VMs (root@vm)
	VMSigner ssh.Signer
	// PanelURL is the panel API base URL (e.g. "http://127.0.0.1:8080" or "https://phpless.digitalno.de")
	PanelURL string
}

// authResponse is the JSON response from the panel's SSH auth endpoint.
type authResponse struct {
	VMIP string `json:"vm_ip"`
	Slug string `json:"slug"`
}

// Server is the SSH proxy server.
type Server struct {
	cfg Config
}

// NewServer creates a new SSH proxy server.
func NewServer(cfg Config) *Server {
	return &Server{cfg: cfg}
}

// ListenAndServe starts the SSH proxy server.
func (s *Server) ListenAndServe() error {
	sshConfig := &ssh.ServerConfig{
		PasswordCallback: func(conn ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
			slug := conn.User()
			token := string(password)

			vmIP, err := s.verifyAccess(slug, token)
			if err != nil {
				log.WithFields(log.Fields{
					"slug":   slug,
					"remote": conn.RemoteAddr(),
				}).WithError(err).Warn("SSH proxy auth failed")
				return nil, fmt.Errorf("authentication failed")
			}

			return &ssh.Permissions{
				Extensions: map[string]string{
					"vm_ip": vmIP,
					"slug":  slug,
				},
			}, nil
		},
		// No other auth methods
		NoClientAuth: false,
	}

	sshConfig.AddHostKey(s.cfg.HostKey)

	listener, err := net.Listen("tcp", s.cfg.ListenAddr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", s.cfg.ListenAddr, err)
	}
	defer listener.Close()

	log.WithField("addr", s.cfg.ListenAddr).Info("SSH proxy server listening")

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.WithError(err).Error("SSH proxy accept error")
			continue
		}
		go s.handleConnection(conn, sshConfig)
	}
}

// verifyAccess checks the bearer token against the Panel API and returns the VM IP.
func (s *Server) verifyAccess(slug, token string) (string, error) {
	url := fmt.Sprintf("%s/api/v1/ssh/verify", s.cfg.PanelURL)

	bodyStruct := struct {
		Slug string `json:"slug"`
	}{Slug: slug}
	bodyBytes, err := json.Marshal(bodyStruct)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}
	req, err := http.NewRequest("POST", url, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("panel API error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("access denied (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var authResp authResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return "", fmt.Errorf("invalid auth response: %w", err)
	}

	if authResp.VMIP == "" {
		return "", fmt.Errorf("app has no running VM")
	}

	return authResp.VMIP, nil
}

func (s *Server) handleConnection(nConn net.Conn, config *ssh.ServerConfig) {
	defer nConn.Close()

	// SSH handshake
	serverConn, chans, reqs, err := ssh.NewServerConn(nConn, config)
	if err != nil {
		log.WithError(err).Debug("SSH proxy handshake failed")
		return
	}
	defer serverConn.Close()

	vmIP := serverConn.Permissions.Extensions["vm_ip"]
	slug := serverConn.Permissions.Extensions["slug"]

	logger := log.WithFields(log.Fields{
		"slug":   slug,
		"vm_ip":  vmIP,
		"remote": nConn.RemoteAddr(),
	})
	logger.Info("SSH proxy session started")

	// Connect to VM
	vmConfig := &ssh.ClientConfig{
		User:            "root",
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(s.cfg.VMSigner)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec
		Timeout:         5 * time.Second,
	}

	var vmClient *ssh.Client
	for attempt := 1; attempt <= 5; attempt++ {
		vmClient, err = ssh.Dial("tcp", vmIP+":22", vmConfig)
		if err == nil {
			break
		}
		if attempt < 5 {
			time.Sleep(time.Duration(attempt) * 300 * time.Millisecond)
		}
	}
	if err != nil {
		logger.WithError(err).Error("Failed to connect to VM")
		return
	}
	defer vmClient.Close()

	// Forward global requests (keepalive etc)
	go ssh.DiscardRequests(reqs)

	// Handle channels
	for newChannel := range chans {
		go s.handleChannel(logger, newChannel, vmClient)
	}

	logger.Info("SSH proxy session ended")
}

func (s *Server) handleChannel(logger *log.Entry, newChannel ssh.NewChannel, vmClient *ssh.Client) {
	// Open same channel type on VM
	vmChannel, vmReqs, err := vmClient.OpenChannel(newChannel.ChannelType(), newChannel.ExtraData())
	if err != nil {
		newChannel.Reject(ssh.ConnectionFailed, err.Error())
		return
	}
	defer vmChannel.Close()

	clientChannel, clientReqs, err := newChannel.Accept()
	if err != nil {
		logger.WithError(err).Error("Failed to accept channel")
		return
	}
	defer clientChannel.Close()

	// Proxy channel data bidirectionally
	var wg sync.WaitGroup

	// client → VM
	wg.Add(1)
	go func() {
		defer wg.Done()
		io.Copy(vmChannel, clientChannel) //nolint:errcheck
		vmChannel.CloseWrite()            //nolint:errcheck
	}()

	// VM → client
	wg.Add(1)
	go func() {
		defer wg.Done()
		io.Copy(clientChannel, vmChannel) //nolint:errcheck
		clientChannel.CloseWrite()        //nolint:errcheck
	}()

	// Proxy requests (pty-req, shell, exec, env, window-change, etc.)
	go proxyRequests(clientReqs, vmChannel)
	go proxyRequests(vmReqs, clientChannel)

	wg.Wait()
}

func proxyRequests(reqs <-chan *ssh.Request, dst ssh.Channel) {
	for req := range reqs {
		ok, err := dst.SendRequest(req.Type, req.WantReply, req.Payload)
		if err != nil {
			return
		}
		if req.WantReply {
			req.Reply(ok, nil) //nolint:errcheck
		}
	}
}

