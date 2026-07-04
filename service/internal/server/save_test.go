package server

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSanitizeShortname(t *testing.T) {
	cases := map[string]string{
		"Login Bug!!":            "login-bug",
		"already-clean_123":      "already-clean_123",
		"---leading-trailing---": "leading-trailing",
		"":                       "",
		"   ":                    "",
	}
	for input, want := range cases {
		got := SanitizeShortname(input)
		if got != want {
			t.Errorf("SanitizeShortname(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSanitizeShortnameCapsAt40(t *testing.T) {
	long := ""
	for i := 0; i < 60; i++ {
		long += "a"
	}
	got := SanitizeShortname(long)
	if len(got) > 40 {
		t.Errorf("len(got) = %d, want <= 40", len(got))
	}
}

func TestBuildFilenameWithoutShortname(t *testing.T) {
	ts := time.Date(2026, 7, 4, 14, 22, 8, 0, time.UTC)
	got := BuildFilename(ts, "")
	want := "2026-07-04_14-22-08.png"
	if got != want {
		t.Errorf("BuildFilename = %q, want %q", got, want)
	}
}

func TestBuildFilenameWithShortname(t *testing.T) {
	ts := time.Date(2026, 7, 4, 14, 22, 8, 0, time.UTC)
	got := BuildFilename(ts, "Login Bug")
	want := "2026-07-04_14-22-08_login-bug.png"
	if got != want {
		t.Errorf("BuildFilename = %q, want %q", got, want)
	}
}

var validPNGHeader = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0, 0, 0}

func TestSaveFileRejectsNonPNG(t *testing.T) {
	dir := t.TempDir()
	_, err := SaveFile(dir, "test.png", []byte("not a png"))
	if err != ErrNotPNG {
		t.Fatalf("err = %v, want ErrNotPNG", err)
	}
}

func TestSaveFileWritesAbsolutePath(t *testing.T) {
	dir := t.TempDir()
	path, err := SaveFile(dir, "test.png", validPNGHeader)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !filepath.IsAbs(path) {
		t.Errorf("path %q is not absolute", path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("could not read saved file: %v", err)
	}
	if len(data) != len(validPNGHeader) {
		t.Errorf("saved file length = %d, want %d", len(data), len(validPNGHeader))
	}
}

func TestSaveFileAvoidsCollisions(t *testing.T) {
	dir := t.TempDir()
	path1, err := SaveFile(dir, "test.png", validPNGHeader)
	if err != nil {
		t.Fatalf("unexpected error on first save: %v", err)
	}
	path2, err := SaveFile(dir, "test.png", validPNGHeader)
	if err != nil {
		t.Fatalf("unexpected error on second save: %v", err)
	}
	if path1 == path2 {
		t.Errorf("expected distinct paths, got %q twice", path1)
	}
	if filepath.Base(path2) != "test-2.png" {
		t.Errorf("second save filename = %q, want test-2.png", filepath.Base(path2))
	}
}
