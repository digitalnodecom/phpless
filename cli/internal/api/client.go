package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
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
	Slug               string `json:"slug"`
	Name               string `json:"name"`
	URL                string `json:"url"`
	VMState            string `json:"vm_state"`
	VCPUs              int    `json:"vcpus"`
	MemMiB             int    `json:"mem_mib"`
	HealthCheckEnabled bool   `json:"health_check_enabled"`
	IsUp               *bool  `json:"is_up"`
	CreatedAt          string `json:"created_at"`
	UpdatedAt          string `json:"updated_at"`
}

// UptimeResponse is the response for the uptime endpoint.
type UptimeResponse struct {
	HealthCheckEnabled bool    `json:"health_check_enabled"`
	IsUp               *bool   `json:"is_up"`
	Uptime24h          *float64 `json:"uptime_24h"`
	Uptime7d           *float64 `json:"uptime_7d"`
	Uptime30d          *float64 `json:"uptime_30d"`
	AvgResponseTime24h *int64   `json:"avg_response_time_24h"`
	LastCheck          *struct {
		StatusCode     int    `json:"status_code"`
		ResponseTimeMs int64  `json:"response_time_ms"`
		IsUp           bool   `json:"is_up"`
		CheckedAt      string `json:"checked_at"`
	} `json:"last_check"`
}

func (c *Client) GetUptime(slug string) (*UptimeResponse, error) {
	var resp UptimeResponse
	err := c.do("GET", "/apps/"+slug+"/uptime", nil, &resp)
	return &resp, err
}

type AppsResponse struct {
	Apps []AppSummary `json:"apps"`
}

func (c *Client) ListApps() (*AppsResponse, error) {
	var resp AppsResponse
	err := c.do("GET", "/apps", nil, &resp)
	return &resp, err
}

type SqliteDatabase struct {
	Path          string `json:"path"`
	Persistent    bool   `json:"persistent"`
	BackupEnabled bool   `json:"backup_enabled"`
	DetectedAt    string `json:"detected_at,omitempty"`
	Size          *int64 `json:"size,omitempty"`
}

type AppDetail struct {
	Slug            string           `json:"slug"`
	Name            string           `json:"name"`
	URL             string           `json:"url"`
	VMState         string           `json:"vm_state"`
	VMID            string           `json:"vm_id"`
	VMIP            string           `json:"vm_ip"`
	VCPUs           int              `json:"vcpus"`
	MemMiB          int              `json:"mem_mib"`
	PHPVersion      string           `json:"php_version"`
	GithubRepo      string           `json:"github_repo"`
	GithubBranch    string           `json:"github_branch"`
	SqliteDatabases []SqliteDatabase `json:"sqlite_databases"`
	CreatedAt       string           `json:"created_at"`
	UpdatedAt       string           `json:"updated_at"`
	Deployments     []struct {
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
	Name           string `json:"name"`
	Slug           string `json:"slug,omitempty"`
	VCPUs          int    `json:"vcpus,omitempty"`
	MemMiB         int    `json:"mem_mib,omitempty"`
	CronEnabled    *bool  `json:"cron_enabled,omitempty"`
	PreviewEnabled *bool  `json:"preview_enabled,omitempty"`
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
	_ = writer.WriteField("source", "cli")
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

// Restart triggers a redeploy of existing code (no tarball upload).
func (c *Client) Restart(slug string) (*DeployResponse, error) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	_ = writer.WriteField("source", "cli")
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

// --- Write File ---

type WriteFileResponse struct {
	Message string `json:"message"`
	Path    string `json:"path"`
}

// WriteFile writes content to a file in the app's build directory.
func (c *Client) WriteFile(slug, path, content string) (*WriteFileResponse, error) {
	var resp WriteFileResponse
	err := c.do("POST", "/apps/"+slug+"/files/write", map[string]string{
		"path":    path,
		"content": content,
	}, &resp)
	return &resp, err
}

// --- Download ---

// DownloadApp downloads the deployed code for an app as a gzipped tar stream.
// The caller is responsible for closing the returned ReadCloser.
func (c *Client) DownloadApp(slug string) (io.ReadCloser, error) {
	req, err := http.NewRequest("GET", c.BaseURL+"/apps/"+slug+"/download", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/gzip")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}

	if resp.StatusCode >= 400 {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		apiErr := &APIError{StatusCode: resp.StatusCode}
		if err := json.Unmarshal(body, apiErr); err != nil {
			apiErr.Message = string(body)
		}
		return nil, apiErr
	}

	return resp.Body, nil
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

type SearchLogEntry struct {
	ID           int    `json:"id"`
	LoggedAt     string `json:"logged_at"`
	Method       string `json:"method"`
	Path         string `json:"path"`
	StatusCode   int    `json:"status_code"`
	DurationMs   int    `json:"duration_ms"`
	IP           string `json:"ip"`
	UserAgent    string `json:"user_agent"`
	ResponseSize int    `json:"response_size"`
}

type SearchLogsResponse struct {
	Logs          []SearchLogEntry `json:"logs"`
	Total         int              `json:"total"`
	Page          int              `json:"page"`
	PerPage       int              `json:"per_page"`
	LastPage      int              `json:"last_page"`
	RetentionDays int              `json:"retention_days"`
}

func (c *Client) SearchLogs(slug, query, status, since string, limit, offset int) (*SearchLogsResponse, error) {
	params := fmt.Sprintf("per_page=%d", limit)
	if offset > 0 {
		params += fmt.Sprintf("&page=%d", offset)
	}
	if query != "" {
		params += "&q=" + query
	}
	if status != "" {
		params += "&status=" + status
	}
	if since != "" {
		params += "&from=" + parseSinceToISO(since)
	}

	var resp SearchLogsResponse
	err := c.do("GET", "/apps/"+slug+"/logs/search?"+params, nil, &resp)
	return &resp, err
}

// parseSinceToISO converts relative durations like "1h", "24h", "7d" to an ISO timestamp.
func parseSinceToISO(since string) string {
	now := time.Now()
	if len(since) < 2 {
		return since
	}
	unit := since[len(since)-1]
	valStr := since[:len(since)-1]
	val := 0
	for _, c := range valStr {
		if c >= '0' && c <= '9' {
			val = val*10 + int(c-'0')
		}
	}
	switch unit {
	case 'h':
		now = now.Add(-time.Duration(val) * time.Hour)
	case 'd':
		now = now.AddDate(0, 0, -val)
	case 'm':
		now = now.Add(-time.Duration(val) * time.Minute)
	default:
		return since
	}
	return now.Format(time.RFC3339)
}

type LogStreamSessionResponse struct {
	SessionID string `json:"session_id"`
}

func (c *Client) CreateLogStreamSession(slug string) (*LogStreamSessionResponse, error) {
	var resp LogStreamSessionResponse
	err := c.do("POST", "/apps/"+slug+"/logs/stream", nil, &resp)
	return &resp, err
}

// --- Files ---

type FileEntry struct {
	Path       string `json:"path"`
	Size       int64  `json:"size"`
	ModifiedAt string `json:"modified_at"`
}

type FilesResponse struct {
	Files []FileEntry `json:"files"`
	Total int         `json:"total"`
}

func (c *Client) ListFiles(slug string) (*FilesResponse, error) {
	var resp FilesResponse
	err := c.do("GET", "/apps/"+slug+"/files", nil, &resp)
	return &resp, err
}

// --- Storage ---

type StorageFile struct {
	Path       string `json:"path"`
	Size       int64  `json:"size"`
	ModifiedAt string `json:"modified_at"`
}

type StorageListResponse struct {
	Files []StorageFile `json:"files"`
}

type StorageWriteResponse struct {
	Message string `json:"message"`
	Path    string `json:"path"`
}

func (c *Client) ListStorage(slug string) (*StorageListResponse, error) {
	var resp StorageListResponse
	err := c.do("GET", "/apps/"+slug+"/storage", nil, &resp)
	return &resp, err
}

func (c *Client) WriteStorage(slug, path, content string) (*StorageWriteResponse, error) {
	var resp StorageWriteResponse
	err := c.do("POST", "/apps/"+slug+"/storage/write", map[string]string{
		"path":    path,
		"content": content,
	}, &resp)
	return &resp, err
}

func (c *Client) DeleteStorage(slug, path string) (*MessageResponse, error) {
	var resp MessageResponse
	err := c.do("DELETE", "/apps/"+slug+"/storage?path="+path, nil, &resp)
	return &resp, err
}

// UploadStorage uploads a local file to persistent storage.
// remotePath is optional; if empty the original filename is used.
func (c *Client) UploadStorage(slug string, fileReader io.Reader, filename, remotePath string) (*StorageWriteResponse, error) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := io.Copy(part, fileReader); err != nil {
		return nil, fmt.Errorf("failed to write file: %w", err)
	}
	if remotePath != "" {
		_ = writer.WriteField("path", remotePath)
	}
	writer.Close()

	req, err := http.NewRequest("POST", c.BaseURL+"/apps/"+slug+"/storage/upload", &buf)
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

	var result StorageWriteResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}
	return &result, nil
}

// DownloadStorage downloads a file from persistent storage.
// The caller is responsible for closing the returned ReadCloser.
func (c *Client) DownloadStorage(slug, path string) (io.ReadCloser, string, error) {
	req, err := http.NewRequest("GET", c.BaseURL+"/apps/"+slug+"/storage/download?path="+path, nil)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create request: %w", err)
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("request failed: %w", err)
	}

	if resp.StatusCode >= 400 {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		apiErr := &APIError{StatusCode: resp.StatusCode}
		if err := json.Unmarshal(body, apiErr); err != nil {
			apiErr.Message = string(body)
		}
		return nil, "", apiErr
	}

	// Extract filename from Content-Disposition header if present
	filename := path
	if cd := resp.Header.Get("Content-Disposition"); cd != "" {
		if _, params, err := mime.ParseMediaType(cd); err == nil {
			if fn, ok := params["filename"]; ok {
				filename = fn
			}
		}
	}

	return resp.Body, filename, nil
}

// --- Databases ---

type DatabasesResponse struct {
	Databases []SqliteDatabase `json:"databases"`
}

func (c *Client) ListDatabases(slug string) (*DatabasesResponse, error) {
	var resp DatabasesResponse
	err := c.do("GET", "/apps/"+slug+"/databases", nil, &resp)
	return &resp, err
}

func (c *Client) UpdateDatabases(slug string, databases []SqliteDatabase) (*DatabasesResponse, error) {
	var resp DatabasesResponse
	err := c.do("PUT", "/apps/"+slug+"/databases", map[string]any{"databases": databases}, &resp)
	return &resp, err
}

// DownloadDatabaseBackup downloads a SQLite database backup from the app's VM.
// The caller is responsible for closing the returned ReadCloser.
func (c *Client) DownloadDatabaseBackup(slug, path string) (io.ReadCloser, string, error) {
	req, err := http.NewRequest("GET", c.BaseURL+"/apps/"+slug+"/databases/backup?path="+path, nil)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create request: %w", err)
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("request failed: %w", err)
	}

	if resp.StatusCode >= 400 {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		apiErr := &APIError{StatusCode: resp.StatusCode}
		if err := json.Unmarshal(body, apiErr); err != nil {
			apiErr.Message = string(body)
		}
		return nil, "", apiErr
	}

	filename := path
	if cd := resp.Header.Get("Content-Disposition"); cd != "" {
		if _, params, err := mime.ParseMediaType(cd); err == nil {
			if fn, ok := params["filename"]; ok {
				filename = fn
			}
		}
	}

	return resp.Body, filename, nil
}

type RestoreDatabaseResponse struct {
	Message string `json:"message"`
	Output  string `json:"output,omitempty"`
}

func (c *Client) RestoreDatabaseBackup(slug, path, timestamp string) (*RestoreDatabaseResponse, error) {
	body := map[string]string{"path": path}
	if timestamp != "" {
		body["timestamp"] = timestamp
	}
	var resp RestoreDatabaseResponse
	err := c.do("POST", "/apps/"+slug+"/databases/restore", body, &resp)
	return &resp, err
}

// --- Rollback ---

type RollbackResponse struct {
	Message    string     `json:"message"`
	Deployment struct {
		ID     int    `json:"id"`
		Status string `json:"status"`
		Source string `json:"source"`
	} `json:"deployment"`
	App AppSummary `json:"app"`
}

func (c *Client) Rollback(slug string, deploymentID int) (*RollbackResponse, error) {
	var resp RollbackResponse
	err := c.do("POST", fmt.Sprintf("/apps/%s/rollback/%d", slug, deploymentID), nil, &resp)
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

// --- Previews ---

type PreviewEnvironment struct {
	ID            int    `json:"id"`
	Branch        string `json:"branch"`
	Slug          string `json:"slug"`
	URL           string `json:"url"`
	VMState       string `json:"vm_state"`
	CommitSHA     string `json:"commit_sha"`
	CommitMessage string `json:"commit_message"`
	CommitAuthor  string `json:"commit_author"`
	CreatedAt     string `json:"created_at"`
	ExpiresAt     string `json:"expires_at"`
}

type PreviewsResponse struct {
	Previews []PreviewEnvironment `json:"previews"`
}

func (c *Client) ListPreviews(appSlug string) (*PreviewsResponse, error) {
	var resp PreviewsResponse
	err := c.do("GET", "/apps/"+appSlug+"/previews", nil, &resp)
	return &resp, err
}

func (c *Client) DestroyPreview(appSlug string, previewID int) (*MessageResponse, error) {
	var resp MessageResponse
	err := c.do("DELETE", fmt.Sprintf("/apps/%s/previews/%d", appSlug, previewID), nil, &resp)
	return &resp, err
}
