package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	getenv := func(string) string { return "" }
	cfg, err := Load([]string{"-token=abc123"}, getenv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Addr != DefaultAddr {
		t.Errorf("Addr = %q, want %q", cfg.Addr, DefaultAddr)
	}
	if cfg.Dir != DefaultDir {
		t.Errorf("Dir = %q, want %q", cfg.Dir, DefaultDir)
	}
	if cfg.MaxBytes != DefaultMaxBytes {
		t.Errorf("MaxBytes = %d, want %d", cfg.MaxBytes, DefaultMaxBytes)
	}
	if cfg.Token != "abc123" {
		t.Errorf("Token = %q, want %q", cfg.Token, "abc123")
	}
	if cfg.RetainDays != 0 {
		t.Errorf("RetainDays = %d, want 0 (disabled by default)", cfg.RetainDays)
	}
	if cfg.RetainMax != 0 {
		t.Errorf("RetainMax = %d, want 0 (disabled by default)", cfg.RetainMax)
	}
}

func TestLoadRetentionPrecedenceFlagOverEnvOverFile(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, "snapdrop.env")
	if err := os.WriteFile(envFile, []byte("SNAPDROP_RETAIN_DAYS=7\nSNAPDROP_RETAIN_MAX=100\n"), 0644); err != nil {
		t.Fatal(err)
	}
	getenv := func(key string) string {
		if key == "SNAPDROP_RETAIN_DAYS" {
			return "14"
		}
		return ""
	}
	// Flag overrides env for days; env is absent for max so file value wins.
	cfg, err := Load([]string{"-token=t", "-env-file=" + envFile, "-retain-days=30"}, getenv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.RetainDays != 30 {
		t.Errorf("RetainDays = %d, want flag value 30", cfg.RetainDays)
	}
	if cfg.RetainMax != 100 {
		t.Errorf("RetainMax = %d, want file value 100", cfg.RetainMax)
	}
}

func TestLoadMissingTokenErrors(t *testing.T) {
	getenv := func(string) string { return "" }
	_, err := Load([]string{}, getenv)
	if err != ErrTokenRequired {
		t.Fatalf("err = %v, want ErrTokenRequired", err)
	}
}

func TestLoadPrecedenceFlagOverEnvOverFile(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, "snapdrop.env")
	if err := os.WriteFile(envFile, []byte("SNAPDROP_ADDR=1.1.1.1:1111\nSNAPDROP_TOKEN=filetoken\n"), 0644); err != nil {
		t.Fatal(err)
	}

	getenv := func(key string) string {
		if key == "SNAPDROP_ADDR" {
			return "2.2.2.2:2222"
		}
		return ""
	}

	cfg, err := Load([]string{"-env-file=" + envFile, "-addr=3.3.3.3:3333"}, getenv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Addr != "3.3.3.3:3333" {
		t.Errorf("Addr = %q, want flag value", cfg.Addr)
	}
	if cfg.Token != "filetoken" {
		t.Errorf("Token = %q, want file value (no flag/env override)", cfg.Token)
	}
}

func TestParseFileValuesIgnoresBlankAndComments(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, "snapdrop.env")
	content := "# comment\n\nSNAPDROP_DIR=/tmp/shots\n"
	if err := os.WriteFile(envFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	values, err := ParseFileValues(envFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if values["SNAPDROP_DIR"] != "/tmp/shots" {
		t.Errorf("values[SNAPDROP_DIR] = %q, want /tmp/shots", values["SNAPDROP_DIR"])
	}
}
