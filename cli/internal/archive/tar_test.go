package archive

import (
	"archive/tar"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"sort"
	"testing"
)

func TestPhplessIgnore(t *testing.T) {
	dir := t.TempDir()

	// Create .phplessignore
	os.WriteFile(filepath.Join(dir, ".phplessignore"), []byte(DefaultIgnoreRules), 0644)

	// Create files/dirs that should be excluded
	os.MkdirAll(filepath.Join(dir, "node_modules"), 0755)
	os.WriteFile(filepath.Join(dir, "node_modules", "foo.js"), []byte("x"), 0644)
	os.MkdirAll(filepath.Join(dir, "vendor"), 0755)
	os.WriteFile(filepath.Join(dir, "vendor", "bar.php"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(dir, ".env"), []byte("SECRET=1"), 0644)
	os.WriteFile(filepath.Join(dir, ".env.local"), []byte("SECRET=2"), 0644)
	os.WriteFile(filepath.Join(dir, "app.log"), []byte("log"), 0644)
	os.WriteFile(filepath.Join(dir, ".DS_Store"), []byte("x"), 0644)

	// Create files that should be included
	os.WriteFile(filepath.Join(dir, "index.php"), []byte("<?php"), 0644)
	os.MkdirAll(filepath.Join(dir, "src"), 0755)
	os.WriteFile(filepath.Join(dir, "src", "app.php"), []byte("<?php"), 0644)

	buf, count, err := CreateTarGz(dir)
	if err != nil {
		t.Fatalf("CreateTarGz failed: %v", err)
	}

	// Extract file names from archive
	gr, _ := gzip.NewReader(buf)
	tr := tar.NewReader(gr)
	var files []string
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		files = append(files, hdr.Name)
	}
	sort.Strings(files)

	expected := []string{"index.php", "src", "src/app.php", "vendor", "vendor/bar.php"}
	sort.Strings(expected)

	if count != 3 { // index.php + src/app.php + vendor/bar.php (dirs don't count in fileCount)
		t.Errorf("expected 3 files, got %d", count)
	}

	if len(files) != len(expected) {
		t.Fatalf("expected %v, got %v", expected, files)
	}
	for i := range expected {
		if files[i] != expected[i] {
			t.Errorf("expected %q at index %d, got %q", expected[i], i, files[i])
		}
	}
}

func TestGitignoreFallback(t *testing.T) {
	dir := t.TempDir()

	// No .phplessignore, only .gitignore
	os.WriteFile(filepath.Join(dir, ".gitignore"), []byte("build/\n*.tmp\n"), 0644)

	os.MkdirAll(filepath.Join(dir, "build"), 0755)
	os.WriteFile(filepath.Join(dir, "build", "out.js"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(dir, "cache.tmp"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(dir, "index.php"), []byte("<?php"), 0644)

	buf, count, err := CreateTarGz(dir)
	if err != nil {
		t.Fatalf("CreateTarGz failed: %v", err)
	}

	gr, _ := gzip.NewReader(buf)
	tr := tar.NewReader(gr)
	var files []string
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		files = append(files, hdr.Name)
	}

	// .gitignore itself is included (not excluded), plus index.php
	if count != 2 {
		t.Errorf("expected 2 files, got %d (files: %v)", count, files)
	}
	// Verify build/ and *.tmp are excluded
	for _, f := range files {
		if f == "build" || f == "cache.tmp" {
			t.Errorf("expected %q to be excluded", f)
		}
	}
}
