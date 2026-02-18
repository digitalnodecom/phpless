package archive

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var defaultExcludes = []string{
	".git",
	"node_modules",
	".phpless.toml",
	".DS_Store",
	"__MACOSX",
}

// CreateTarGz creates a tar.gz archive of the given directory.
// It respects .gitignore patterns and default exclusions.
// Returns the archive bytes and the file count.
func CreateTarGz(dir string) (*bytes.Buffer, int, error) {
	dir, err := filepath.Abs(dir)
	if err != nil {
		return nil, 0, err
	}

	ignorePatterns := loadGitignore(dir)

	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)

	fileCount := 0

	err = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}

		if relPath == "." {
			return nil
		}

		if shouldExclude(relPath, info.IsDir(), ignorePatterns) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = relPath

		if err := tw.WriteHeader(header); err != nil {
			return err
		}

		if !info.Mode().IsRegular() {
			return nil
		}

		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()

		if _, err := io.Copy(tw, f); err != nil {
			return err
		}

		fileCount++
		return nil
	})

	if err != nil {
		return nil, 0, fmt.Errorf("failed to create archive: %w", err)
	}

	if err := tw.Close(); err != nil {
		return nil, 0, err
	}
	if err := gw.Close(); err != nil {
		return nil, 0, err
	}

	return &buf, fileCount, nil
}

func shouldExclude(relPath string, isDir bool, ignorePatterns []string) bool {
	name := filepath.Base(relPath)

	for _, excl := range defaultExcludes {
		if name == excl || relPath == excl {
			return true
		}
	}

	for _, pattern := range ignorePatterns {
		if matchPattern(pattern, relPath, isDir) {
			return true
		}
	}

	return false
}

func loadGitignore(dir string) []string {
	path := filepath.Join(dir, ".gitignore")
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var patterns []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		patterns = append(patterns, line)
	}
	return patterns
}

func matchPattern(pattern, path string, isDir bool) bool {
	// Handle negation — skip negated patterns (simplified)
	if strings.HasPrefix(pattern, "!") {
		return false
	}

	// Handle directory-only patterns (ending with /)
	dirOnly := false
	if strings.HasSuffix(pattern, "/") {
		dirOnly = true
		pattern = strings.TrimSuffix(pattern, "/")
	}

	// Check if pattern matches any component of the path
	name := filepath.Base(path)

	// Direct name match
	if matched, _ := filepath.Match(pattern, name); matched {
		if dirOnly && !isDir {
			return false
		}
		return true
	}

	// Match against full relative path
	if matched, _ := filepath.Match(pattern, path); matched {
		if dirOnly && !isDir {
			return false
		}
		return true
	}

	// Handle ** patterns (simplified)
	if strings.Contains(pattern, "**") {
		cleaned := strings.ReplaceAll(pattern, "**/", "")
		if matched, _ := filepath.Match(cleaned, name); matched {
			return true
		}
	}

	// For directory-only patterns, check path components
	if dirOnly {
		parts := strings.Split(path, string(filepath.Separator))
		for _, part := range parts {
			if matched, _ := filepath.Match(pattern, part); matched {
				return true
			}
		}
	}

	return false
}
