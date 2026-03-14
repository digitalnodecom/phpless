package cmd

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newStorageCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "storage",
		Short: "Manage persistent storage for an app",
	}

	cmd.AddCommand(newStorageListCmd())
	cmd.AddCommand(newStorageUploadCmd())
	cmd.AddCommand(newStorageWriteCmd())
	cmd.AddCommand(newStorageDownloadCmd())
	cmd.AddCommand(newStorageDeleteCmd())

	return cmd
}

func newStorageListCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List files in persistent storage",
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			resp, err := client.ListStorage(slug)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			if len(resp.Files) == 0 {
				ui.Info("No files in storage for '%s'.", slug)
				return nil
			}

			rows := make([][]string, len(resp.Files))
			for i, f := range resp.Files {
				rows[i] = []string{f.Path, formatSize(f.Size), f.ModifiedAt}
			}
			ui.Table([]string{"Path", "Size", "Modified"}, rows)

			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")
	return cmd
}

func newStorageUploadCmd() *cobra.Command {
	var appSlug string
	var remotePath string

	cmd := &cobra.Command{
		Use:   "upload <file>",
		Short: "Upload a local file to persistent storage",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			localPath := args[0]

			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			f, err := os.Open(localPath)
			if err != nil {
				return fmt.Errorf("cannot open file: %w", err)
			}
			defer f.Close()

			filename := filepath.Base(localPath)
			dest := remotePath
			if dest == "" {
				dest = filename
			}

			ui.Info("Uploading '%s' to storage/%s...", filename, dest)

			resp, err := client.UploadStorage(slug, f, filename, dest)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			ui.Success("Uploaded to /app/storage/%s", resp.Path)
			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")
	cmd.Flags().StringVar(&remotePath, "path", "", "Remote path in storage (default: filename)")
	return cmd
}

func newStorageWriteCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "write <remote-path>",
		Short: "Write a file in persistent storage from stdin",
		Long:  "Write a file in persistent storage. Content is read from stdin.\n\nExample:\n  echo 'APP_ENV=production' | phpless storage write .env\n  cat local.env | phpless storage write .env",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			remotePath := args[0]

			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			content, err := io.ReadAll(os.Stdin)
			if err != nil {
				return fmt.Errorf("failed to read stdin: %w", err)
			}

			resp, err := client.WriteStorage(slug, remotePath, string(content))
			if err != nil {
				handleAPIError(err)
				return nil
			}

			ui.Success("Written to /app/storage/%s", resp.Path)
			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")
	return cmd
}

func newStorageDownloadCmd() *cobra.Command {
	var appSlug string
	var outputPath string

	cmd := &cobra.Command{
		Use:   "download <remote-path>",
		Short: "Download a file from persistent storage",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			remotePath := args[0]

			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			reader, suggestedName, err := client.DownloadStorage(slug, remotePath)
			if err != nil {
				handleAPIError(err)
				return nil
			}
			defer reader.Close()

			// Determine output destination
			dest := outputPath
			if dest == "" {
				dest = filepath.Base(suggestedName)
			}

			// Write to stdout if dest is "-"
			if dest == "-" {
				_, err = io.Copy(os.Stdout, reader)
				return err
			}

			f, err := os.Create(dest)
			if err != nil {
				return fmt.Errorf("cannot create file: %w", err)
			}
			defer f.Close()

			n, err := io.Copy(f, reader)
			if err != nil {
				return fmt.Errorf("download failed: %w", err)
			}

			ui.Success("Downloaded %s → %s (%s)", remotePath, dest, formatSize(n))
			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")
	cmd.Flags().StringVarP(&outputPath, "output", "o", "", "Local output path (default: filename, use - for stdout)")
	return cmd
}

func newStorageDeleteCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "delete <remote-path>",
		Short: "Delete a file from persistent storage",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			remotePath := args[0]

			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			_, err = client.DeleteStorage(slug, remotePath)
			if err != nil {
				handleAPIError(err)
				return nil
			}

			ui.Success("Deleted /app/storage/%s", remotePath)
			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug")
	return cmd
}
