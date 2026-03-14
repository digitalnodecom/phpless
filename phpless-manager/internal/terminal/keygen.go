package terminal

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/crypto/ssh"
)

// EnsureKeyPair generates an ed25519 keypair at keyPath if absent.
// Returns an ssh.Signer and the one-line authorized_keys entry.
func EnsureKeyPair(keyPath string) (ssh.Signer, string, error) {
	// Try to load existing key
	if data, err := os.ReadFile(keyPath); err == nil {
		signer, err := ssh.ParsePrivateKey(data)
		if err == nil {
			authLine := string(ssh.MarshalAuthorizedKey(signer.PublicKey()))
			return signer, authLine, nil
		}
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(keyPath), 0700); err != nil {
		return nil, "", fmt.Errorf("create key dir: %w", err)
	}

	// Generate new ed25519 keypair
	pubKey, privKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, "", fmt.Errorf("generate key: %w", err)
	}

	// Marshal and write private key
	pemBlock, err := ssh.MarshalPrivateKey(privKey, "")
	if err != nil {
		return nil, "", fmt.Errorf("marshal private key: %w", err)
	}
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(pemBlock), 0600); err != nil {
		return nil, "", fmt.Errorf("write private key: %w", err)
	}

	// Build authorized_keys line
	sshPub, err := ssh.NewPublicKey(pubKey)
	if err != nil {
		return nil, "", fmt.Errorf("create ssh public key: %w", err)
	}
	authLine := string(ssh.MarshalAuthorizedKey(sshPub))

	signer, err := ssh.NewSignerFromKey(privKey)
	if err != nil {
		return nil, "", fmt.Errorf("create signer: %w", err)
	}

	return signer, authLine, nil
}
