package config

import (
	"bufio"
	"errors"
	"flag"
	"os"
	"strconv"
	"strings"
)

const (
	DefaultAddr     = "0.0.0.0:9922"
	DefaultDir      = "./screenshots"
	DefaultMaxBytes = int64(33554432)
)

type Config struct {
	Addr     string
	Dir      string
	Token    string
	MaxBytes int64
}

var ErrTokenRequired = errors.New("config: token is required (set SNAPDROP_TOKEN, -token, or token=... in env file)")

// ParseFileValues reads KEY=VALUE lines from path, ignoring blank lines and
// lines starting with '#'. Returns a map of upper-cased keys to values. If
// path is "", returns an empty map with no error.
func ParseFileValues(path string) (map[string]string, error) {
	values := map[string]string{}
	if path == "" {
		return values, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.ToUpper(strings.TrimSpace(parts[0]))
		values[key] = strings.TrimSpace(parts[1])
	}
	return values, scanner.Err()
}

// Load resolves configuration with precedence: flags > env vars > file > defaults.
// args should be os.Args[1:]. getenv should be os.Getenv (injected for testing).
func Load(args []string, getenv func(string) string) (Config, error) {
	fs := flag.NewFlagSet("snapdropd", flag.ContinueOnError)
	addrFlag := fs.String("addr", "", "listen address")
	dirFlag := fs.String("dir", "", "screenshot save directory")
	tokenFlag := fs.String("token", "", "shared auth token")
	maxBytesFlag := fs.Int64("max-bytes", 0, "max upload size in bytes")
	envFileFlag := fs.String("env-file", "", "optional KEY=VALUE config file")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}

	fileValues, err := ParseFileValues(*envFileFlag)
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		Addr:     DefaultAddr,
		Dir:      DefaultDir,
		MaxBytes: DefaultMaxBytes,
	}

	if v := fileValues["SNAPDROP_ADDR"]; v != "" {
		cfg.Addr = v
	}
	if v := getenv("SNAPDROP_ADDR"); v != "" {
		cfg.Addr = v
	}
	if *addrFlag != "" {
		cfg.Addr = *addrFlag
	}

	if v := fileValues["SNAPDROP_DIR"]; v != "" {
		cfg.Dir = v
	}
	if v := getenv("SNAPDROP_DIR"); v != "" {
		cfg.Dir = v
	}
	if *dirFlag != "" {
		cfg.Dir = *dirFlag
	}

	if v := fileValues["SNAPDROP_TOKEN"]; v != "" {
		cfg.Token = v
	}
	if v := getenv("SNAPDROP_TOKEN"); v != "" {
		cfg.Token = v
	}
	if *tokenFlag != "" {
		cfg.Token = *tokenFlag
	}

	if v := fileValues["SNAPDROP_MAX_BYTES"]; v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			cfg.MaxBytes = n
		}
	}
	if v := getenv("SNAPDROP_MAX_BYTES"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			cfg.MaxBytes = n
		}
	}
	if *maxBytesFlag != 0 {
		cfg.MaxBytes = *maxBytesFlag
	}

	if cfg.Token == "" {
		return Config{}, ErrTokenRequired
	}

	return cfg, nil
}
