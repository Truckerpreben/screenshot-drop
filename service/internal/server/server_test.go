package server

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewServerRejectsUncreatableDir(t *testing.T) {
	tmp := t.TempDir()
	fileInTheWay := filepath.Join(tmp, "afile")
	if err := os.WriteFile(fileInTheWay, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	// A directory whose parent path component is a regular file cannot be created.
	badDir := filepath.Join(fileInTheWay, "sub")
	if _, err := NewServer("127.0.0.1:0", "tok", badDir, 1024); err == nil {
		t.Fatalf("expected error for uncreatable dir, got nil")
	}
}

func TestNewServerCreatesAndResolvesDir(t *testing.T) {
	tmp := t.TempDir()
	rel := filepath.Join(tmp, "nested", "shots")
	srv, err := NewServer("127.0.0.1:0", "tok", rel, 1024)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if srv == nil {
		t.Fatal("expected non-nil server")
	}
	if info, err := os.Stat(rel); err != nil || !info.IsDir() {
		t.Errorf("expected save dir %q to exist as a directory (err=%v)", rel, err)
	}
}
