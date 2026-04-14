package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/phpless/cli/internal/api"
	"github.com/phpless/cli/internal/archive"
	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/sshutil"
	"github.com/spf13/cobra"
)

func newMCPCmd(version string) *cobra.Command {
	return &cobra.Command{
		Use:    "mcp",
		Short:  "Start MCP server (for AI tool integration)",
		Long:   "Starts a Model Context Protocol server over stdio for integration with AI tools like Claude Code, Cursor, etc.",
		Hidden: false,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runMCPServer(version)
		},
	}
}

// mcpClient lazily creates an authenticated API client.
// Returns a clear error if not logged in.
func mcpClient() (*api.Client, error) {
	cfg, err := config.LoadGlobal()
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %w", err)
	}
	if cfg.Token == "" {
		return nil, fmt.Errorf("not authenticated — run 'phpless login' first")
	}
	baseURL := cfg.APIURL
	if apiURLFlag != "" {
		baseURL = apiURLFlag
	}
	return api.NewClient(baseURL, cfg.Token), nil
}

// jsonResult marshals v as indented JSON and returns a text tool result.
func jsonResult(v any) (*mcp.CallToolResult, error) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal result: %w", err)
	}
	return mcp.NewToolResultText(string(data)), nil
}

func runMCPServer(version string) error {
	s := server.NewMCPServer(
		"phpless",
		version,
		server.WithToolCapabilities(false),
		server.WithResourceCapabilities(false, false),
		server.WithPromptCapabilities(false),
	)

	registerTools(s)
	registerResources(s)
	registerPrompts(s)

	return server.ServeStdio(s)
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

func registerTools(s *server.MCPServer) {
	// whoami
	s.AddTool(mcp.NewTool("whoami",
		mcp.WithDescription("Show the currently authenticated user and team"),
	), handleWhoami)

	// list_apps
	s.AddTool(mcp.NewTool("list_apps",
		mcp.WithDescription("List all apps in the current team"),
	), handleListApps)

	// get_app
	s.AddTool(mcp.NewTool("get_app",
		mcp.WithDescription("Get detailed information about an app"),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
	), handleGetApp)

	// create_app
	s.AddTool(mcp.NewTool("create_app",
		mcp.WithDescription("Create a new app"),
		mcp.WithString("name", mcp.Required(), mcp.Description("App name")),
		mcp.WithString("slug", mcp.Description("Custom slug (auto-generated from name if omitted)")),
		mcp.WithNumber("vcpus", mcp.Description("Number of vCPUs (1 or 2, default 1)")),
		mcp.WithNumber("mem_mib", mcp.Description("Memory in MiB (128, 256, 512, or 1024, default 256)")),
		mcp.WithBoolean("cron_enabled", mcp.Description("Enable Laravel scheduler (runs php artisan schedule:run every minute)")),
	), handleCreateApp)

	// delete_app
	s.AddTool(mcp.NewTool("delete_app",
		mcp.WithDescription("Delete an app and its VM"),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
	), handleDeleteApp)

	// deploy
	s.AddTool(mcp.NewTool("deploy",
		mcp.WithDescription("Deploy code from a local directory to an app"),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
		mcp.WithString("directory", mcp.Required(), mcp.Description("Path to the directory to deploy")),
	), handleDeploy)

	// pull_app
	s.AddTool(mcp.NewTool("pull_app",
		mcp.WithDescription("Download deployed code from an app into a local directory"),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
		mcp.WithString("directory", mcp.Required(), mcp.Description("Path to the directory to extract code into")),
	), handlePullApp)

	// get_logs
	s.AddTool(mcp.NewTool("get_logs",
		mcp.WithDescription("Get recent access logs for an app"),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
	), handleGetLogs)

	// list_files
	s.AddTool(mcp.NewTool("list_files",
		mcp.WithDescription("List deployed files for an app"),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
	), handleListFiles)

	// list_env
	s.AddTool(mcp.NewTool("list_env",
		mcp.WithDescription("List environment variables"),
		mcp.WithString("scope", mcp.Required(), mcp.Description("Scope: 'app' or 'team'"), mcp.Enum("app", "team")),
		mcp.WithString("slug", mcp.Description("App slug (required when scope is 'app')")),
	), handleListEnv)

	// set_env
	s.AddTool(mcp.NewTool("set_env",
		mcp.WithDescription("Set an environment variable"),
		mcp.WithString("scope", mcp.Required(), mcp.Description("Scope: 'app' or 'team'"), mcp.Enum("app", "team")),
		mcp.WithString("key", mcp.Required(), mcp.Description("Variable name")),
		mcp.WithString("value", mcp.Required(), mcp.Description("Variable value")),
		mcp.WithString("slug", mcp.Description("App slug (required when scope is 'app')")),
	), handleSetEnv)

	// get_app_status
	s.AddTool(mcp.NewTool("get_app_status",
		mcp.WithDescription("Get health status, uptime percentage, and last check time for an app"),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
	), handleGetAppStatus)

	// ssh_exec
	s.AddTool(mcp.NewTool("ssh_exec",
		mcp.WithDescription("Execute a shell command inside an app's VM via SSH. Returns stdout, stderr, and exit code. Use for running artisan commands, checking PHP status, inspecting the filesystem, etc."),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
		mcp.WithString("command", mcp.Required(), mcp.Description("Shell command to execute (e.g. 'ls -la /app', 'php artisan migrate')")),
	), handleSSHExec)

	// delete_env
	s.AddTool(mcp.NewTool("delete_env",
		mcp.WithDescription("Delete an environment variable"),
		mcp.WithString("scope", mcp.Required(), mcp.Description("Scope: 'app' or 'team'"), mcp.Enum("app", "team")),
		mcp.WithString("key", mcp.Required(), mcp.Description("Variable name")),
		mcp.WithString("slug", mcp.Description("App slug (required when scope is 'app')")),
	), handleDeleteEnv)

	// restart_app
	s.AddTool(mcp.NewTool("restart_app",
		mcp.WithDescription("Restart an app's VM by redeploying existing code. Useful after config changes or to recover from a stuck state."),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
	), handleRestartApp)

	// write_file
	s.AddTool(mcp.NewTool("write_file",
		mcp.WithDescription("Write a file to the app's build directory. Useful for quick edits without a full redeploy. Call deploy or restart_app afterward to apply changes to the running VM."),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
		mcp.WithString("path", mcp.Required(), mcp.Description("File path relative to app root (e.g. 'index.php', 'public/style.css')")),
		mcp.WithString("content", mcp.Required(), mcp.Description("File content")),
	), handleWriteFile)

	// batch_set_env
	s.AddTool(mcp.NewTool("batch_set_env",
		mcp.WithDescription("Set multiple environment variables at once. More efficient than calling set_env multiple times."),
		mcp.WithString("scope", mcp.Required(), mcp.Description("Scope: 'app' or 'team'"), mcp.Enum("app", "team")),
		mcp.WithString("slug", mcp.Description("App slug (required when scope is 'app')")),
		mcp.WithObject("variables", mcp.Required(), mcp.Description("Key-value pairs of environment variables to set")),
	), handleBatchSetEnv)

	// create_and_deploy
	s.AddTool(mcp.NewTool("create_and_deploy",
		mcp.WithDescription("Create a new app and deploy code from a local directory in one step. If the app already exists, just deploys."),
		mcp.WithString("name", mcp.Required(), mcp.Description("App name")),
		mcp.WithString("directory", mcp.Required(), mcp.Description("Path to the directory to deploy")),
	), handleCreateAndDeploy)

	// list_databases
	s.AddTool(mcp.NewTool("list_databases",
		mcp.WithDescription("List SQLite databases detected in an app, with size info when running"),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
	), handleListDatabases)

	// enable_db_backup
	s.AddTool(mcp.NewTool("enable_db_backup",
		mcp.WithDescription("Enable backup for SQLite database(s). If path is omitted, enables for all detected databases."),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
		mcp.WithString("path", mcp.Description("Database path (omit to enable for all)")),
	), handleEnableDbBackup)

	// disable_db_backup
	s.AddTool(mcp.NewTool("disable_db_backup",
		mcp.WithDescription("Disable backup for SQLite database(s). If path is omitted, disables for all databases."),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
		mcp.WithString("path", mcp.Description("Database path (omit to disable for all)")),
	), handleDisableDbBackup)

	// download_db_backup
	s.AddTool(mcp.NewTool("download_db_backup",
		mcp.WithDescription("Download a SQLite database backup from an app's VM. Saves to a temp file and returns the path."),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
		mcp.WithString("path", mcp.Description("Database path (defaults to first backed-up or detected database)")),
	), handleDownloadDbBackup)

	// restore_database
	s.AddTool(mcp.NewTool("restore_database",
		mcp.WithDescription("Restore a SQLite database from a Litestream backup"),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
		mcp.WithString("path", mcp.Description("Database path (defaults to first database)")),
		mcp.WithString("timestamp", mcp.Description("Restore to specific point in time (ISO 8601 format, omit for latest)")),
	), handleRestoreDatabase)

	// rollback
	s.AddTool(mcp.NewTool("rollback",
		mcp.WithDescription("Rollback an app to a previous deployment. If no deployment_id is given, rolls back to the previous successful deployment."),
		mcp.WithString("slug", mcp.Required(), mcp.Description("App slug")),
		mcp.WithNumber("deployment_id", mcp.Description("Deployment ID to rollback to (omit for the previous one)")),
	), handleRollback)
}

func handleWhoami(_ context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	userResp, err := client.GetUser()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	teamResp, err := client.GetTeam()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(map[string]any{
		"user": userResp.User,
		"team": teamResp.Team,
	})
}

func handleListApps(_ context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	resp, err := client.ListApps()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleGetAppStatus(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	resp, err := client.GetUptime(slug)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleGetApp(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	resp, err := client.GetApp(slug)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleCreateApp(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	name, err := req.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	createReq := &api.CreateAppRequest{Name: name}
	if s := req.GetString("slug", ""); s != "" {
		createReq.Slug = s
	}
	if v := req.GetInt("vcpus", 0); v > 0 {
		createReq.VCPUs = v
	}
	if m := req.GetInt("mem_mib", 0); m > 0 {
		createReq.MemMiB = m
	}
	if cronEnabled := req.GetBool("cron_enabled", false); cronEnabled {
		createReq.CronEnabled = &cronEnabled
	}
	resp, err := client.CreateApp(createReq)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleDeleteApp(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	resp, err := client.DeleteApp(slug)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleSSHExec(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	command, err := req.RequireString("command")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	resp, err := sshutil.RunCommand(slug, command)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Truncate output for MCP context limits
	const maxLen = 50 * 1024
	result := map[string]any{
		"exit_code": resp.ExitCode,
		"stdout":    truncate(resp.Stdout, maxLen),
		"stderr":    truncate(resp.Stderr, maxLen),
	}

	return jsonResult(result)
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "\n[output truncated]"
}

func handleDeploy(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	dir, err := req.RequireString("directory")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Resolve to absolute path
	dir, err = filepath.Abs(dir)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("invalid directory path: %s", err)), nil
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return mcp.NewToolResultError(fmt.Sprintf("directory not found: %s", dir)), nil
	}

	tarBuf, fileCount, err := archive.CreateTarGz(dir)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to create archive: %s", err)), nil
	}

	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	resp, err := client.Deploy(slug, tarBuf, "deploy.tar.gz")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	result := map[string]any{
		"message":    resp.Message,
		"app":        resp.App,
		"file_count": fileCount,
		"archive_kb": float64(tarBuf.Len()) / 1024,
	}

	// Include detected databases if present in the app detail
	appDetail, err := client.GetApp(slug)
	if err == nil && appDetail != nil && len(appDetail.App.SqliteDatabases) > 0 {
		result["detected_databases"] = appDetail.App.SqliteDatabases
	}

	return jsonResult(result)
}

func handlePullApp(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	dir, err := req.RequireString("directory")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	dir, err = filepath.Abs(dir)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("invalid directory path: %s", err)), nil
	}

	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	body, err := client.DownloadApp(slug)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	defer body.Close()

	fileCount, err := extractTarGz(body, dir)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to extract archive: %s", err)), nil
	}

	return jsonResult(map[string]any{
		"message":    fmt.Sprintf("Pulled %d files into %s", fileCount, dir),
		"slug":       slug,
		"directory":  dir,
		"file_count": fileCount,
	})
}

func handleGetLogs(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	resp, err := client.GetLogs(slug)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleListFiles(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	resp, err := client.ListFiles(slug)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleListEnv(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	scope, err := req.RequireString("scope")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	if scope == "team" {
		resp, err := client.ListTeamEnv()
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		return jsonResult(resp)
	}

	slug := req.GetString("slug", "")
	if slug == "" {
		return mcp.NewToolResultError("slug is required when scope is 'app'"), nil
	}
	resp, err := client.ListAppEnv(slug)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleSetEnv(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	scope, err := req.RequireString("scope")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	key, err := req.RequireString("key")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	value, err := req.RequireString("value")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	vars := map[string]string{key: value}

	if scope == "team" {
		resp, err := client.SetTeamEnv(vars)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		return jsonResult(resp)
	}

	slug := req.GetString("slug", "")
	if slug == "" {
		return mcp.NewToolResultError("slug is required when scope is 'app'"), nil
	}
	resp, err := client.SetAppEnv(slug, vars)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleDeleteEnv(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	scope, err := req.RequireString("scope")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	key, err := req.RequireString("key")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	if scope == "team" {
		resp, err := client.DeleteTeamEnv(key)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		return jsonResult(resp)
	}

	slug := req.GetString("slug", "")
	if slug == "" {
		return mcp.NewToolResultError("slug is required when scope is 'app'"), nil
	}
	resp, err := client.DeleteAppEnv(slug, key)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleRestartApp(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	resp, err := client.Restart(slug)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(map[string]any{
		"message": resp.Message,
		"app":     resp.App,
	})
}

func handleWriteFile(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	path, err := req.RequireString("path")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	content, err := req.RequireString("content")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	resp, err := client.WriteFile(slug, path, content)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleBatchSetEnv(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	scope, err := req.RequireString("scope")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Extract variables object from the request
	args := req.GetArguments()
	rawVars, ok := args["variables"]
	if !ok {
		return mcp.NewToolResultError("variables is required"), nil
	}
	varsMap, ok := rawVars.(map[string]any)
	if !ok {
		return mcp.NewToolResultError("variables must be an object of key-value string pairs"), nil
	}

	vars := make(map[string]string, len(varsMap))
	for k, v := range varsMap {
		vars[k] = fmt.Sprintf("%v", v)
	}

	if len(vars) == 0 {
		return mcp.NewToolResultError("variables must contain at least one key-value pair"), nil
	}

	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	if scope == "team" {
		resp, err := client.SetTeamEnv(vars)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		return jsonResult(resp)
	}

	slug := req.GetString("slug", "")
	if slug == "" {
		return mcp.NewToolResultError("slug is required when scope is 'app'"), nil
	}
	resp, err := client.SetAppEnv(slug, vars)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleCreateAndDeploy(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	name, err := req.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	dir, err := req.RequireString("directory")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	dir, err = filepath.Abs(dir)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("invalid directory path: %s", err)), nil
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return mcp.NewToolResultError(fmt.Sprintf("directory not found: %s", dir)), nil
	}

	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Try to get existing app first
	slug := name
	var appResp *api.AppDetailResponse
	appResp, err = client.GetApp(slug)

	created := false
	if err != nil {
		// App doesn't exist — create it
		createResp, createErr := client.CreateApp(&api.CreateAppRequest{Name: name})
		if createErr != nil {
			return mcp.NewToolResultError(fmt.Sprintf("failed to create app: %s", createErr)), nil
		}
		slug = createResp.App.Slug
		created = true
		// Refresh app detail
		appResp, _ = client.GetApp(slug)
	}

	// Deploy code
	tarBuf, fileCount, err := archive.CreateTarGz(dir)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to create archive: %s", err)), nil
	}

	deployResp, err := client.Deploy(slug, tarBuf, "deploy.tar.gz")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("deploy failed: %s", err)), nil
	}

	url := deployResp.App.URL
	if url == "" {
		url = fmt.Sprintf("https://%s.phpless.app", slug)
	}

	result := map[string]any{
		"created":    created,
		"slug":       slug,
		"url":        url,
		"message":    deployResp.Message,
		"file_count": fileCount,
		"archive_kb": float64(tarBuf.Len()) / 1024,
	}
	if appResp != nil {
		result["app"] = appResp.App
	}

	return jsonResult(result)
}

func handleListDatabases(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	resp, err := client.ListDatabases(slug)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return jsonResult(resp)
}

func handleEnableDbBackup(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	resp, err := client.ListDatabases(slug)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if len(resp.Databases) == 0 {
		return mcp.NewToolResultError("no databases detected for this app"), nil
	}

	targetPath := req.GetString("path", "")
	updated := make([]api.SqliteDatabase, len(resp.Databases))
	changed := 0
	for i, db := range resp.Databases {
		updated[i] = db
		if targetPath == "" || db.Path == targetPath {
			updated[i].BackupEnabled = true
			updated[i].Persistent = true
			changed++
		}
	}

	if targetPath != "" && changed == 0 {
		return mcp.NewToolResultError(fmt.Sprintf("database path %q not found", targetPath)), nil
	}

	updateResp, err := client.UpdateDatabases(slug, updated)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	return jsonResult(map[string]any{
		"message":   fmt.Sprintf("Enabled backup for %d database(s)", changed),
		"databases": updateResp.Databases,
	})
}

func handleDisableDbBackup(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	resp, err := client.ListDatabases(slug)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if len(resp.Databases) == 0 {
		return mcp.NewToolResultError("no databases detected for this app"), nil
	}

	targetPath := req.GetString("path", "")
	updated := make([]api.SqliteDatabase, len(resp.Databases))
	changed := 0
	for i, db := range resp.Databases {
		updated[i] = db
		if targetPath == "" || db.Path == targetPath {
			updated[i].BackupEnabled = false
			changed++
		}
	}

	if targetPath != "" && changed == 0 {
		return mcp.NewToolResultError(fmt.Sprintf("database path %q not found", targetPath)), nil
	}

	updateResp, err := client.UpdateDatabases(slug, updated)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	return jsonResult(map[string]any{
		"message":   fmt.Sprintf("Disabled backup for %d database(s)", changed),
		"databases": updateResp.Databases,
	})
}

func handleDownloadDbBackup(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	dbPath := req.GetString("path", "")

	// If no path specified, find the first backed-up or detected database
	if dbPath == "" {
		resp, err := client.ListDatabases(slug)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		if len(resp.Databases) == 0 {
			return mcp.NewToolResultError("no databases detected for this app"), nil
		}
		// Prefer first backup-enabled DB, else first DB
		for _, db := range resp.Databases {
			if db.BackupEnabled {
				dbPath = db.Path
				break
			}
		}
		if dbPath == "" {
			dbPath = resp.Databases[0].Path
		}
	}

	body, filename, err := client.DownloadDatabaseBackup(slug, dbPath)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	defer body.Close()

	// Save to temp file
	tmpDir := os.TempDir()
	tmpFile := filepath.Join(tmpDir, fmt.Sprintf("phpless-%s-%s", slug, filename))
	f, err := os.Create(tmpFile)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to create temp file: %s", err)), nil
	}
	defer f.Close()

	written, err := copyWithLimit(f, body, 500*1024*1024) // 500MB limit
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to write backup: %s", err)), nil
	}

	return jsonResult(map[string]any{
		"message":  fmt.Sprintf("Downloaded database backup to %s", tmpFile),
		"path":     tmpFile,
		"db_path":  dbPath,
		"size":     written,
		"size_mib": float64(written) / 1024 / 1024,
	})
}

// copyWithLimit copies up to limit bytes from src to dst.
func copyWithLimit(dst *os.File, src io.Reader, limit int64) (int64, error) {
	return io.Copy(dst, io.LimitReader(src, limit))
}

func handleRestoreDatabase(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	dbPath := req.GetString("path", "")
	timestamp := req.GetString("timestamp", "")

	// If no path specified, find the first database
	if dbPath == "" {
		resp, err := client.ListDatabases(slug)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		if len(resp.Databases) == 0 {
			return mcp.NewToolResultError("no databases detected for this app"), nil
		}
		dbPath = resp.Databases[0].Path
	}

	resp, err := client.RestoreDatabaseBackup(slug, dbPath, timestamp)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	return jsonResult(resp)
}

func handleRollback(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	slug, err := req.RequireString("slug")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	client, err := mcpClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	deploymentID := req.GetInt("deployment_id", 0)

	if deploymentID == 0 {
		// Find the previous successful deployment
		appResp, err := client.GetApp(slug)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}

		skippedCurrent := false
		for _, d := range appResp.App.Deployments {
			if d.Status == "succeeded" {
				if !skippedCurrent {
					skippedCurrent = true
					continue
				}
				deploymentID = d.ID
				break
			}
		}

		if deploymentID == 0 {
			return mcp.NewToolResultError("no previous deployment to rollback to"), nil
		}
	}

	resp, err := client.Rollback(slug, deploymentID)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	return jsonResult(resp)
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

func registerResources(s *server.MCPServer) {
	// Static: platform overview
	s.AddResource(mcp.NewResource(
		"phpless://docs/overview",
		"PHPless Platform Overview",
		mcp.WithResourceDescription("Platform capabilities, architecture, and resource options"),
		mcp.WithMIMEType("text/markdown"),
	), handleDocsOverview)

	// Static: quickstart guide
	s.AddResource(mcp.NewResource(
		"phpless://docs/quickstart",
		"PHPless Quickstart Guide",
		mcp.WithResourceDescription("Step-by-step guide to deploy your first PHP app"),
		mcp.WithMIMEType("text/markdown"),
	), handleDocsQuickstart)

	// Dynamic: project config
	s.AddResource(mcp.NewResource(
		"phpless://project-config",
		"Current Project Config",
		mcp.WithResourceDescription("Reads .phpless.toml from the current working directory"),
		mcp.WithMIMEType("application/toml"),
	), handleProjectConfig)
}

func handleDocsOverview(_ context.Context, _ mcp.ReadResourceRequest) ([]mcp.ResourceContents, error) {
	return []mcp.ResourceContents{
		mcp.TextResourceContents{
			URI:      "phpless://docs/overview",
			MIMEType: "text/markdown",
			Text: `# PHPless Platform

PHPless is a serverless PHP hosting platform powered by Firecracker microVMs and FrankenPHP.

## Architecture
- **Execution plane**: Firecracker microVMs with dedicated kernel, rootfs, and FrankenPHP
- **Control plane**: Go daemon managing VM lifecycle via REST API
- **Management plane**: Laravel panel with React/Inertia dashboard

## Resource Options
| Option | Values |
|--------|--------|
| vCPUs  | 1, 2 |
| Memory | 128, 256, 512, 1024 MiB |

## Features
- Sub-second cold starts (~1.2s boot-to-ready)
- Per-app isolated microVMs
- Automatic HTTPS via Caddy
- Environment variables (app-level and team-level)
- Deploy via CLI tarball upload or Git push (coming soon)
- Access logs and deployment history

## Default URL Pattern
Each app gets: https://<slug>.phpless.app
`,
		},
	}, nil
}

func handleDocsQuickstart(_ context.Context, _ mcp.ReadResourceRequest) ([]mcp.ResourceContents, error) {
	return []mcp.ResourceContents{
		mcp.TextResourceContents{
			URI:      "phpless://docs/quickstart",
			MIMEType: "text/markdown",
			Text: `# PHPless Quickstart

## 1. Install the CLI
` + "```bash" + `
brew install phpless/tap/phpless
` + "```" + `

## 2. Log in
` + "```bash" + `
phpless login
` + "```" + `

## 3. Create an app
` + "```bash" + `
phpless apps create "My App"
` + "```" + `

## 4. Initialize your project
` + "```bash" + `
cd /path/to/your/php-project
phpless init
` + "```" + `
This creates a .phpless.toml linking your directory to the app.

## 5. Deploy
` + "```bash" + `
phpless deploy
` + "```" + `

## 6. Check logs
` + "```bash" + `
phpless logs <slug>
` + "```" + `

## Environment Variables
` + "```bash" + `
# App-level
phpless env set --app my-app DB_HOST=localhost

# Team-level (shared across all apps)
phpless env set --team SHARED_KEY=value

# List
phpless env list --app my-app
` + "```" + `
`,
		},
	}, nil
}

func handleProjectConfig(_ context.Context, _ mcp.ReadResourceRequest) ([]mcp.ResourceContents, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("cannot determine working directory: %w", err)
	}

	projCfg, projDir, err := config.FindProjectConfig(cwd)
	if err != nil {
		return nil, fmt.Errorf("error reading project config: %w", err)
	}
	if projCfg == nil {
		return []mcp.ResourceContents{
			mcp.TextResourceContents{
				URI:      "phpless://project-config",
				MIMEType: "text/plain",
				Text:     "No .phpless.toml found in the current directory tree. Run 'phpless init' to create one.",
			},
		}, nil
	}

	configPath := filepath.Join(projDir, config.ProjectConfigFile)
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read %s: %w", configPath, err)
	}

	return []mcp.ResourceContents{
		mcp.TextResourceContents{
			URI:      "phpless://project-config",
			MIMEType: "application/toml",
			Text:     string(data),
		},
	}, nil
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

func registerPrompts(s *server.MCPServer) {
	// deploy-app prompt
	s.AddPrompt(mcp.NewPrompt("deploy-app",
		mcp.WithPromptDescription("Guide through deploying code to an existing PHPless app"),
		mcp.WithArgument("slug",
			mcp.ArgumentDescription("The app slug to deploy to"),
			mcp.RequiredArgument(),
		),
		mcp.WithArgument("directory",
			mcp.ArgumentDescription("Path to the directory to deploy (defaults to current directory)"),
		),
	), handleDeployPrompt)

	// setup-project prompt
	s.AddPrompt(mcp.NewPrompt("setup-project",
		mcp.WithPromptDescription("Guide through creating a new PHPless app and deploying for the first time"),
		mcp.WithArgument("name",
			mcp.ArgumentDescription("Name for the new app"),
			mcp.RequiredArgument(),
		),
		mcp.WithArgument("directory",
			mcp.ArgumentDescription("Path to the project directory (defaults to current directory)"),
		),
	), handleSetupPrompt)
}

func handleDeployPrompt(_ context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
	slug := req.Params.Arguments["slug"]
	dir := req.Params.Arguments["directory"]
	if dir == "" {
		dir = "."
	}

	return &mcp.GetPromptResult{
		Description: fmt.Sprintf("Deploy to %s", slug),
		Messages: []mcp.PromptMessage{
			mcp.NewPromptMessage(mcp.RoleUser, mcp.NewTextContent(fmt.Sprintf(
				`I want to deploy my PHP app to PHPless. Please help me with these steps:

1. First, use the get_app tool to check that app "%s" exists and note its current state.
2. Then deploy the code from directory "%s" using the deploy tool.
3. After deployment, use get_logs to check for any errors.

If the app doesn't exist, let me know and suggest using create_app first.`, slug, dir))),
		},
	}, nil
}

func handleSetupPrompt(_ context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
	name := req.Params.Arguments["name"]
	dir := req.Params.Arguments["directory"]
	if dir == "" {
		dir = "."
	}

	return &mcp.GetPromptResult{
		Description: fmt.Sprintf("Set up %s on PHPless", name),
		Messages: []mcp.PromptMessage{
			mcp.NewPromptMessage(mcp.RoleUser, mcp.NewTextContent(fmt.Sprintf(
				`I want to set up a new PHP app called "%s" on PHPless. Please help me:

1. First, use whoami to verify I'm authenticated.
2. Create the app using create_app with name "%s".
3. Deploy the code from directory "%s" using the deploy tool.
4. Use get_app to verify everything is running and show me the URL.

If I'm not authenticated, tell me to run 'phpless login' first.`, name, name, dir))),
		},
	}, nil
}
