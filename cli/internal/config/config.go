package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
)

const (
	DefaultAPIURL     = "https://phpless.digitalno.de/api/v1"
	GlobalConfigDir   = "phpless"
	GlobalConfigFile  = "config.toml"
	ProjectConfigFile = ".phpless.toml"
)

// GlobalConfig is stored at ~/.config/phpless/config.toml.
type GlobalConfig struct {
	APIURL string `toml:"api_url"`
	Token  string `toml:"token"`
}

// ProjectConfig is stored at .phpless.toml in the project root.
type ProjectConfig struct {
	App       string `toml:"app"`
	Directory string `toml:"directory"`
}

// GlobalConfigPath returns the path to ~/.config/phpless/config.toml.
func GlobalConfigPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine config directory: %w", err)
	}
	return filepath.Join(configDir, GlobalConfigDir, GlobalConfigFile), nil
}

// LoadGlobal loads the global config file. Returns defaults if file doesn't exist.
func LoadGlobal() (*GlobalConfig, error) {
	path, err := GlobalConfigPath()
	if err != nil {
		return nil, err
	}

	cfg := &GlobalConfig{
		APIURL: DefaultAPIURL,
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		return cfg, nil
	}

	if _, err := toml.DecodeFile(path, cfg); err != nil {
		return nil, fmt.Errorf("failed to parse %s: %w", path, err)
	}

	if cfg.APIURL == "" {
		cfg.APIURL = DefaultAPIURL
	}

	return cfg, nil
}

// SaveGlobal saves the global config to disk with secure permissions.
func SaveGlobal(cfg *GlobalConfig) error {
	path, err := GlobalConfigPath()
	if err != nil {
		return err
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}
	defer f.Close()

	return toml.NewEncoder(f).Encode(cfg)
}

// FindProjectConfig walks up from startDir to find .phpless.toml.
// Returns nil if not found.
func FindProjectConfig(startDir string) (*ProjectConfig, string, error) {
	dir, err := filepath.Abs(startDir)
	if err != nil {
		return nil, "", err
	}

	for {
		path := filepath.Join(dir, ProjectConfigFile)
		if _, err := os.Stat(path); err == nil {
			cfg := &ProjectConfig{}
			if _, err := toml.DecodeFile(path, cfg); err != nil {
				return nil, "", fmt.Errorf("failed to parse %s: %w", path, err)
			}
			return cfg, dir, nil
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return nil, "", nil
}

// ResolveAppSlug resolves the app slug from a flag value, project config, or returns an error.
func ResolveAppSlug(flagValue string) (string, error) {
	if flagValue != "" {
		return flagValue, nil
	}

	projCfg, _, err := FindProjectConfig(".")
	if err != nil {
		return "", err
	}
	if projCfg != nil && projCfg.App != "" {
		return projCfg.App, nil
	}

	return "", fmt.Errorf("no app specified. Use --app flag or create a .phpless.toml with 'phpless init'")
}
