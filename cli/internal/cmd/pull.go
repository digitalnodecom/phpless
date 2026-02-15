package cmd

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/phpless/cli/internal/config"
	"github.com/phpless/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newPullCmd() *cobra.Command {
	var appSlug string

	cmd := &cobra.Command{
		Use:   "pull [directory]",
		Short: "Download deployed code from an app",
		Long:  "Downloads the currently deployed code for an app as a tarball and extracts it into the target directory.",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := config.ResolveAppSlug(appSlug)
			if err != nil {
				return err
			}

			dir := "."
			if len(args) > 0 {
				dir = args[0]
			}

			dir, err = filepath.Abs(dir)
			if err != nil {
				return fmt.Errorf("invalid directory path: %w", err)
			}

			client, err := requireAuth()
			if err != nil {
				return err
			}

			ui.Info("Pulling code from '%s'...", slug)

			spin := ui.NewSpinner("Downloading...")
			spin.Start()
			body, err := client.DownloadApp(slug)
			spin.Stop()

			if err != nil {
				handleAPIError(err)
				return nil
			}
			defer body.Close()

			fileCount, err := extractTarGz(body, dir)
			if err != nil {
				return fmt.Errorf("failed to extract archive: %w", err)
			}

			if ui.JSONMode {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(map[string]any{
					"slug":       slug,
					"directory":  dir,
					"file_count": fileCount,
				})
			}

			ui.Success("Pulled %d files into %s", fileCount, dir)
			return nil
		},
	}

	cmd.Flags().StringVar(&appSlug, "app", "", "App slug to pull from")

	return cmd
}

// extractTarGz reads a gzipped tar stream and extracts it into destDir.
// Returns the number of files extracted.
func extractTarGz(r io.Reader, destDir string) (int, error) {
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return 0, fmt.Errorf("failed to create directory: %w", err)
	}

	gz, err := gzip.NewReader(r)
	if err != nil {
		return 0, fmt.Errorf("failed to decompress: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	fileCount := 0

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fileCount, fmt.Errorf("tar read error: %w", err)
		}

		target := filepath.Join(destDir, header.Name)

		// Prevent path traversal
		if !filepath.IsAbs(target) {
			target, _ = filepath.Abs(target)
		}
		rel, err := filepath.Rel(destDir, target)
		if err != nil || len(rel) > 1 && rel[:2] == ".." {
			continue
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, os.FileMode(header.Mode)); err != nil {
				return fileCount, err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return fileCount, err
			}
			f, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return fileCount, err
			}
			if _, err := io.Copy(f, tr); err != nil {
				f.Close()
				return fileCount, err
			}
			f.Close()
			fileCount++
		}
	}

	return fileCount, nil
}
