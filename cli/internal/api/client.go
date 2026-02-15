package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

// Client is the PHPless API client.
type Client struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client
}

// APIError represents an error response from the API.
type APIError struct {
	StatusCode int
	Message    string              `json:"message"`
	Errors     map[string][]string `json:"errors,omitempty"`
}

func (e *APIError) Error() string {
	if len(e.Errors) > 0 {
		var parts []string
		for field, msgs := range e.Errors {
			for _, msg := range msgs {
				parts = append(parts, fmt.Sprintf("%s: %s", field, msg))
			}
		}
		return fmt.Sprintf("%s (%s)", e.Message, strings.Join(parts, "; "))
	}
	return e.Message
}

// NewClient creates a new API client.
func NewClient(baseURL, token string) *Client {
	return &Client{
		BaseURL: baseURL,
		Token:   token,
		HTTPClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

func (c *Client) do(method, path string, body any, result any) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to encode request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.BaseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		apiErr := &APIError{StatusCode: resp.StatusCode}
		if err := json.Unmarshal(respBody, apiErr); err != nil {
			apiErr.Message = string(respBody)
		}
		return apiErr
	}

	if result != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, result); err != nil {
			return fmt.Errorf("failed to decode response: %w", err)
		}
	}

	return nil
}

// --- Auth ---

type AuthResponse struct {
	Token string `json:"token"`
	User  struct {
		ID    int    `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
	} `json:"user"`
}

func (c *Client) Login(email, password string) (*AuthResponse, error) {
	var resp AuthResponse
	err := c.do("POST", "/auth/token", map[string]string{
		"email":    email,
		"password": password,
	}, &resp)
	return &resp, err
}

// --- User ---

type UserResponse struct {
	User struct {
		ID          int    `json:"id"`
		Name        string `json:"name"`
		Email       string `json:"email"`
		CurrentTeam *struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
			Slug string `json:"slug"`
		} `json:"current_team"`
		CreatedAt string `json:"created_at"`
	} `json:"user"`
}

func (c *Client) GetUser() (*UserResponse, error) {
	var resp UserResponse
	err := c.do("GET", "/user", nil, &resp)
	return &resp, err
}

// --- Team ---

type TeamResponse struct {
	Team struct {
		ID        int    `json:"id"`
		Name      string `json:"name"`
		Slug      string `json:"slug"`
		Plan      string `json:"plan"`
		AppCount  int    `json:"app_count"`
		AppLimit  int    `json:"app_limit"`
		CreatedAt string `json:"created_at"`
	} `json:"team"`
}

func (c *Client) GetTeam() (*TeamResponse, error) {
	var resp TeamResponse
	err := c.do("GET", "/team", nil, &resp)
	return &resp, err
}

// --- Apps ---

type AppSummary struct {
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	VMState   string `json:"vm_state"`
	VCPUs     int    `json:"vcpus"`
	MemMiB    int    `json:"mem_mib"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type AppsResponse struct {
	Apps []AppSummary `json:"apps"`
}

func (c *Client) ListApps() (*AppsResponse, error) {
	var resp AppsResponse
	err := c.do("GET", "/apps", nil, &resp)
	return &resp, err
}

type AppDetail struct {
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	URL          string `json:"url"`
	VMState      string `json:"vm_state"`
	VMID         string `json:"vm_id"`
	VMIP         string `json:"vm_ip"`
	VCPUs        int    `json:"vcpus"`
	MemMiB       int    `json:"mem_mib"`
	PHPVersion   string `json:"php_version"`
	GithubRepo   string `json:"github_repo"`
	GithubBranch string `json:"github_branch"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
	Deployments  []struct {
		ID            int    `json:"id"`
		Status        string `json:"status"`
		CommitMessage string `json:"commit_message"`
		CreatedAt     string `json:"created_at"`
	} `json:"deployments"`
	Domains []struct {
		Domain    string `json:"domain"`
		Type      string `json:"type"`
		SSLActive bool   `json:"ssl_active"`
	} `json:"domains"`
}

type AppDetailResponse struct {
	App AppDetail `json:"app"`
}

func (c *Client) GetApp(slug string) (*AppDetailResponse, error) {
	var resp AppDetailResponse
	err := c.do("GET", "/apps/"+slug, nil, &resp)
	return &resp, err
}

type CreateAppRequest struct {
	Name   string `json:"name"`
	Slug   string `json:"slug,omitempty"`
	VCPUs  int    `json:"vcpus,omitempty"`
	MemMiB int    `json:"mem_mib,omitempty"`
}

type CreateAppResponse struct {
	App AppSummary `json:"app"`
}

func (c *Client) CreateApp(req *CreateAppRequest) (*CreateAppResponse, error) {
	var resp CreateAppResponse
	err := c.do("POST", "/apps", req, &resp)
	return &resp, err
}

type MessageResponse struct {
	Message string `json:"message"`
}

func (c *Client) DeleteApp(slug string) (*MessageResponse, error) {
	var resp MessageResponse
	err := c.do("DELETE", "/apps/"+slug, nil, &resp)
	return &resp, err
}

// --- Deploy ---

type DeployResponse struct {
	Message string     `json:"message"`
	App     AppSummary `json:"app"`
}

func (c *Client) Deploy(slug string, tarball io.Reader, filename string) (*DeployResponse, error) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	part, err := writer.CreateFormFile("tarball", filename)
	if err != nil {
		return nil, fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := io.Copy(part, tarball); err != nil {
		return nil, fmt.Errorf("failed to write tarball: %w", err)
	}
	writer.Close()

	req, err := http.NewRequest("POST", c.BaseURL+"/apps/"+slug+"/deploy", &buf)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		apiErr := &APIError{StatusCode: resp.StatusCode}
		if err := json.Unmarshal(respBody, apiErr); err != nil {
			apiErr.Message = string(respBody)
		}
		return nil, apiErr
	}

	var deployResp DeployResponse
	if err := json.Unmarshal(respBody, &deployResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &deployResp, nil
}

// --- Logs ---

type LogEntry struct {
	Timestamp string  `json:"timestamp"`
	Method    string  `json:"method"`
	Path      string  `json:"path"`
	Status    int     `json:"status"`
	Duration  float64 `json:"duration"`
	ClientIP  string  `json:"client_ip"`
	Size      int     `json:"size"`
}

type LogsResponse struct {
	Logs []LogEntry `json:"logs"`
}

func (c *Client) GetLogs(slug string) (*LogsResponse, error) {
	var resp LogsResponse
	err := c.do("GET", "/apps/"+slug+"/logs", nil, &resp)
	return &resp, err
}

// --- Environment Variables ---

type EnvVar struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	IsSecret  bool   `json:"is_secret"`
	Source    string `json:"source,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type EnvListResponse struct {
	Vars []EnvVar `json:"vars"`
}

func (c *Client) ListAppEnv(slug string) (*EnvListResponse, error) {
	var resp EnvListResponse
	err := c.do("GET", "/apps/"+slug+"/env", nil, &resp)
	return &resp, err
}

func (c *Client) SetAppEnv(slug string, vars map[string]string) (*MessageResponse, error) {
	var resp MessageResponse
	err := c.do("PUT", "/apps/"+slug+"/env", map[string]any{"vars": vars}, &resp)
	return &resp, err
}

func (c *Client) DeleteAppEnv(slug, key string) (*MessageResponse, error) {
	var resp MessageResponse
	err := c.do("DELETE", "/apps/"+slug+"/env/"+key, nil, &resp)
	return &resp, err
}

func (c *Client) ListTeamEnv() (*EnvListResponse, error) {
	var resp EnvListResponse
	err := c.do("GET", "/team/env", nil, &resp)
	return &resp, err
}

func (c *Client) SetTeamEnv(vars map[string]string) (*MessageResponse, error) {
	var resp MessageResponse
	err := c.do("PUT", "/team/env", map[string]any{"vars": vars}, &resp)
	return &resp, err
}

func (c *Client) DeleteTeamEnv(key string) (*MessageResponse, error) {
	var resp MessageResponse
	err := c.do("DELETE", "/team/env/"+key, nil, &resp)
	return &resp, err
}
