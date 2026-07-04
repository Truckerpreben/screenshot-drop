# Screenshot Drop Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browser extension (Brave/Chromium MV3 + Firefox MV3) that captures/annotates screenshots and POSTs them to a Go LAN receiving service that saves them and returns the absolute file path.

**Architecture:** Monorepo: `extension/` (TypeScript, esbuild, vitest, webextension-polyfill; framework-free canvas core reusable in Wails) + `service/` (Go stdlib-only single static binary, systemd). Shared-token + extension-origin-scheme lockdown auth over plain HTTP on the LAN.

**Tech Stack:** TypeScript, esbuild, vitest, webextension-polyfill; Go (stdlib only); systemd.

---

## How to read this plan

- Tasks are numbered T1–T13 in dependency order. `[P]` next to a task means it can run in parallel with the other `[P]`-marked tasks listed alongside it — there is no file overlap between them.
- Every Go task and every pure-TypeScript task (`core/`, `platform/` with mocks) follows strict TDD: write the failing test first, run it and confirm the failure, write the minimal implementation, run it and confirm the pass, commit.
- Browser-glue tasks (`ext/`) can't be meaningfully unit tested without a real browser — those steps are: write the code, build, then a manual verification checklist.
- All file paths are relative to the repo root (`snapdrop-extension/`).

---

## Task 1: Scaffold + build tooling

**Files:**
- Create: `Makefile`
- Create: `.gitignore`
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/vitest.config.ts`
- Create: `extension/esbuild.config.mjs`
- Create: `extension/manifest.base.json`
- Create: `extension/manifest.chromium.json`
- Create: `extension/manifest.firefox.json`
- Create: `extension/public/popup.html`
- Create: `extension/public/options.html`
- Create: `extension/public/annotate.html`
- Create: `extension/public/icons/icon16.png`
- Create: `extension/public/icons/icon48.png`
- Create: `extension/public/icons/icon128.png`
- Create: `extension/src/styles/popup.css`
- Create: `extension/src/styles/options.css`
- Create: `extension/src/styles/annotate.css`
- Create: `extension/src/ext/background.ts`
- Create: `extension/src/ext/popup.entry.ts`
- Create: `extension/src/ext/options.entry.ts`
- Create: `extension/src/ext/annotate.entry.ts`
- Create: `extension/src/ext/overlay.content.ts`
- Create: `service/go.mod`
- Create: `service/Makefile`
- Create: `service/cmd/snapdropd/main.go`

This task has no unit tests of its own — it establishes the build tooling that every later task relies on. Verification is "the build succeeds and produces the expected output."

- [ ] **Step 1: Write the top-level Makefile and .gitignore**

`Makefile`:

```makefile
.PHONY: ext service test

ext:
	cd extension && npm run build

service:
	cd service && make build

test:
	cd extension && npm test
	cd service && make test
```

`.gitignore`:

```
node_modules/
extension/dist/
service/bin/
*.log
.DS_Store
```

- [ ] **Step 2: Write the extension package/tooling config**

`extension/package.json`:

```json
{
  "name": "screenshot-drop-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "build": "node esbuild.config.mjs",
    "build:chromium": "node esbuild.config.mjs --target=chromium",
    "build:firefox": "node esbuild.config.mjs --target=firefox",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "esbuild": "^0.21.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0",
    "@types/chrome": "^0.0.270"
  },
  "dependencies": {
    "webextension-polyfill": "^0.12.0"
  }
}
```

`extension/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["chrome"],
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

`extension/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
```

- [ ] **Step 3: Write the manifest fragments**

`extension/manifest.base.json`:

```json
{
  "manifest_version": 3,
  "name": "Screenshot Drop",
  "version": "0.1.0",
  "description": "Capture, annotate, and send screenshots to a LAN destination.",
  "permissions": ["activeTab", "tabs", "scripting", "storage", "clipboardWrite"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "popup.html"
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

`extension/manifest.chromium.json`:

```json
{
  "background": {
    "service_worker": "background.js"
  },
  "permissions": ["debugger"],
  "minimum_chrome_version": "116"
}
```

`extension/manifest.firefox.json`:

```json
{
  "background": {
    "scripts": ["background.js"]
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "screenshot-drop@hca.local",
      "strict_min_version": "121.0"
    }
  }
}
```

- [ ] **Step 4: Write the esbuild config**

`extension/esbuild.config.mjs`:

```js
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ENTRY_POINTS = {
  background: 'src/ext/background.ts',
  'annotate.entry': 'src/ext/annotate.entry.ts',
  'options.entry': 'src/ext/options.entry.ts',
  'popup.entry': 'src/ext/popup.entry.ts',
  'overlay.content': 'src/ext/overlay.content.ts'
};

function parseArgs(argv) {
  const targetArg = argv.find((a) => a.startsWith('--target='));
  const target = targetArg ? targetArg.split('=')[1] : 'both';
  if (!['chromium', 'firefox', 'both'].includes(target)) {
    throw new Error(`Unknown --target: ${target}`);
  }
  return { target };
}

function deepMergeManifest(base, overlay) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (Array.isArray(value) && Array.isArray(out[key])) {
      out[key] = [...new Set([...out[key], ...value])];
    } else if (
      typeof value === 'object' &&
      value !== null &&
      typeof out[key] === 'object' &&
      out[key] !== null &&
      !Array.isArray(value)
    ) {
      out[key] = deepMergeManifest(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function buildManifest(target) {
  const base = JSON.parse(readFileSync(join(__dirname, 'manifest.base.json'), 'utf8'));
  const overlay = JSON.parse(readFileSync(join(__dirname, `manifest.${target}.json`), 'utf8'));
  return deepMergeManifest(base, overlay);
}

function copyStaticAssets(outDir) {
  mkdirSync(outDir, { recursive: true });
  cpSync(join(__dirname, 'public'), outDir, { recursive: true });
  const stylesOut = join(outDir, 'styles');
  mkdirSync(stylesOut, { recursive: true });
  cpSync(join(__dirname, 'src/styles'), stylesOut, { recursive: true });
}

async function buildTarget(target) {
  const outDir = join(__dirname, 'dist', target);
  copyStaticAssets(outDir);

  await esbuild.build({
    entryPoints: ENTRY_POINTS,
    entryNames: '[name]',
    outdir: outDir,
    bundle: true,
    format: 'iife',
    target: 'es2020',
    define: { __TARGET__: JSON.stringify(target) },
    logLevel: 'info'
  });

  const manifest = buildManifest(target);
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Built ${target} -> ${outDir}`);
}

const { target } = parseArgs(process.argv.slice(2));
const targets = target === 'both' ? ['chromium', 'firefox'] : [target];
for (const t of targets) {
  await buildTarget(t);
}
```

- [ ] **Step 5: Write stub HTML/CSS/entry files so the bundle has something to build**

`extension/public/popup.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="styles/popup.css" />
  </head>
  <body>
    <div id="app"></div>
    <script src="popup.entry.js"></script>
  </body>
</html>
```

`extension/public/options.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="styles/options.css" />
  </head>
  <body>
    <div id="app"></div>
    <script src="options.entry.js"></script>
  </body>
</html>
```

`extension/public/annotate.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="styles/annotate.css" />
  </head>
  <body>
    <div id="app"></div>
    <script src="annotate.entry.js"></script>
  </body>
</html>
```

`extension/src/styles/popup.css`:

```css
/* popup styles - filled in by Task 10 */
```

`extension/src/styles/options.css`:

```css
/* options styles - filled in by Task 12 */
```

`extension/src/styles/annotate.css`:

```css
/* annotate styles - filled in by Task 12 */
```

`extension/src/ext/background.ts`:

```ts
export {};
```

`extension/src/ext/popup.entry.ts`:

```ts
export {};
```

`extension/src/ext/options.entry.ts`:

```ts
export {};
```

`extension/src/ext/annotate.entry.ts`:

```ts
export {};
```

`extension/src/ext/overlay.content.ts`:

```ts
export {};
```

- [ ] **Step 6: Generate placeholder icon assets**

Run:

```bash
mkdir -p extension/public/icons
for size in 16 48 128; do
  base64 -d > "extension/public/icons/icon${size}.png" <<< "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
done
```

This writes a valid, minimal 1x1 PNG to each of the three icon paths referenced by `manifest.base.json`. (These same bytes are reused as the test-fixture image in Task 13's curl matrix.)

- [ ] **Step 7: Build the extension and verify**

Run:

```bash
cd extension && npm install && npm run build
```

Expected: no errors; `extension/dist/chromium/` and `extension/dist/firefox/` each contain `background.js`, `annotate.entry.js`, `options.entry.js`, `popup.entry.js`, `overlay.content.js`, `manifest.json`, the three HTML files, and a `styles/` and `icons/` directory. Confirm the merge worked:

```bash
cat extension/dist/chromium/manifest.json | grep -A2 '"background"'
cat extension/dist/firefox/manifest.json | grep -A2 '"background"'
```

Expected: chromium shows `"service_worker": "background.js"`, firefox shows `"scripts": ["background.js"]`, and both retain `"permissions"` with the base list merged with their target-specific additions (chromium also has `"debugger"`).

- [ ] **Step 8: Write the Go module scaffold**

`service/go.mod`:

```
module snapdrop/service

go 1.22
```

`service/Makefile`:

```makefile
.PHONY: build test

build:
	CGO_ENABLED=0 go build -o bin/snapdropd ./cmd/snapdropd

test:
	go test ./...
```

`service/cmd/snapdropd/main.go`:

```go
package main

import "fmt"

func main() {
	fmt.Println("snapdropd: not yet implemented")
}
```

- [ ] **Step 9: Verify the Go scaffold builds clean**

Run:

```bash
cd service && go vet ./... && go build -o bin/snapdropd ./cmd/snapdropd && ./bin/snapdropd
```

Expected: `go vet` prints nothing (clean), the build succeeds, and running the binary prints `snapdropd: not yet implemented`.

- [ ] **Step 10: Commit**

```bash
git add Makefile .gitignore extension service
git commit -m "chore: scaffold extension and service build tooling"
```

---

## Task 2: Go config (TDD) `[P with Task 3, Task 4]`

**Files:**
- Create: `service/internal/config/config.go`
- Test: `service/internal/config/config_test.go`

Precedence is **flags > env > optional KEY=VALUE file > defaults**. Note: the `-gen-token` flag itself is handled in `cmd/snapdropd/main.go` (Task 5), not inside `config.Load` — that keeps this package independent of the `internal/token` package built in Task 3, so the two tasks can run in parallel without a dependency edge.

- [ ] **Step 1: Write the failing tests**

`service/internal/config/config_test.go`:

```go
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd service && go test ./internal/config/...`
Expected: FAIL — build error, `undefined: Load`, `undefined: DefaultAddr`, etc. (the package doesn't exist yet).

- [ ] **Step 3: Write the implementation**

`service/internal/config/config.go`:

```go
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd service && go test ./internal/config/... -v`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add service/internal/config
git commit -m "feat(service): add config loader with flag>env>file precedence"
```

---

## Task 3: Go token + auth middleware (TDD) `[P with Task 2, Task 4]`

**Files:**
- Create: `service/internal/token/token.go`
- Test: `service/internal/token/token_test.go`
- Create: `service/internal/server/auth.go`
- Test: `service/internal/server/auth_test.go`

- [ ] **Step 1: Write the failing token test**

`service/internal/token/token_test.go`:

```go
package token

import "testing"

func TestGenerateTokenLength(t *testing.T) {
	tok, err := GenerateToken()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// 32 raw bytes -> RawURLEncoding produces 43 chars (ceil(32*8/6), no padding).
	if len(tok) != 43 {
		t.Errorf("len(token) = %d, want 43", len(tok))
	}
}

func TestGenerateTokenUnique(t *testing.T) {
	a, err := GenerateToken()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b, err := GenerateToken()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a == b {
		t.Errorf("expected two calls to produce different tokens")
	}
}
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd service && go test ./internal/token/...`
Expected: FAIL — `undefined: GenerateToken` (package/function don't exist yet).

- [ ] **Step 3: Write the token implementation**

`service/internal/token/token.go`:

```go
package token

import (
	"crypto/rand"
	"encoding/base64"
)

// GenerateToken returns a URL-safe, unpadded base64 encoding of 32
// cryptographically random bytes, suitable for use as a shared auth token.
func GenerateToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd service && go test ./internal/token/... -v`
Expected: PASS (both tests).

- [ ] **Step 5: Commit the token package**

```bash
git add service/internal/token
git commit -m "feat(service): add crypto-random token generator"
```

- [ ] **Step 6: Write the failing auth middleware tests**

`service/internal/server/auth_test.go`:

```go
package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

func TestAuthMiddlewareRejectsBadOrigin(t *testing.T) {
	mw := AuthMiddleware("secret", okHandler())
	req := httptest.NewRequest(http.MethodPost, "/upload", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	req.Header.Set("X-Snapdrop-Token", "secret")
	rec := httptest.NewRecorder()
	mw.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestAuthMiddlewareAllowsExtensionOrigins(t *testing.T) {
	for _, origin := range []string{"chrome-extension://abc123", "moz-extension://def456", ""} {
		mw := AuthMiddleware("secret", okHandler())
		req := httptest.NewRequest(http.MethodPost, "/upload", nil)
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		req.Header.Set("X-Snapdrop-Token", "secret")
		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("origin %q: status = %d, want %d", origin, rec.Code, http.StatusOK)
		}
	}
}

func TestAuthMiddlewareRejectsBadToken(t *testing.T) {
	mw := AuthMiddleware("secret", okHandler())
	req := httptest.NewRequest(http.MethodPost, "/upload", nil)
	req.Header.Set("Origin", "chrome-extension://abc123")
	req.Header.Set("X-Snapdrop-Token", "wrong")
	rec := httptest.NewRecorder()
	mw.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddlewareHandlesPreflight(t *testing.T) {
	mw := AuthMiddleware("secret", okHandler())
	req := httptest.NewRequest(http.MethodOptions, "/upload", nil)
	req.Header.Set("Origin", "chrome-extension://abc123")
	rec := httptest.NewRecorder()
	mw.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "chrome-extension://abc123" {
		t.Errorf("Access-Control-Allow-Origin = %q, want echoed origin", got)
	}
}

func TestAuthMiddlewareNeverUsesWildcardCORS(t *testing.T) {
	mw := AuthMiddleware("secret", okHandler())
	req := httptest.NewRequest(http.MethodPost, "/upload", nil)
	req.Header.Set("Origin", "chrome-extension://abc123")
	req.Header.Set("X-Snapdrop-Token", "secret")
	rec := httptest.NewRecorder()
	mw.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got == "*" {
		t.Errorf("Access-Control-Allow-Origin must never be *, got %q", got)
	}
}
```

- [ ] **Step 7: Run and confirm failure**

Run: `cd service && go test ./internal/server/...`
Expected: FAIL — `undefined: AuthMiddleware` (package `server` doesn't exist yet).

- [ ] **Step 8: Write the auth middleware implementation**

`service/internal/server/auth.go`:

```go
package server

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
)

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func isAllowedOrigin(origin string) bool {
	if origin == "" {
		return true
	}
	return strings.HasPrefix(origin, "chrome-extension://") || strings.HasPrefix(origin, "moz-extension://")
}

func setCORSHeaders(w http.ResponseWriter, origin string) {
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Headers", "X-Snapdrop-Token, Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Vary", "Origin")
}

// AuthMiddleware enforces the extension-origin lockdown and shared-token
// check, and answers CORS preflight requests. It never echoes "*" for
// Access-Control-Allow-Origin — only the specific extension origin.
func AuthMiddleware(token string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		if !isAllowedOrigin(origin) {
			writeJSONError(w, http.StatusForbidden, "origin not allowed")
			return
		}

		setCORSHeaders(w, origin)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		reqToken := r.Header.Get("X-Snapdrop-Token")
		if subtle.ConstantTimeCompare([]byte(reqToken), []byte(token)) != 1 {
			writeJSONError(w, http.StatusUnauthorized, "invalid or missing token")
			return
		}

		next.ServeHTTP(w, r)
	})
}
```

- [ ] **Step 9: Run and confirm pass**

Run: `cd service && go test ./internal/server/... -v`
Expected: PASS (all 5 tests).

- [ ] **Step 10: Commit**

```bash
git add service/internal/server/auth.go service/internal/server/auth_test.go
git commit -m "feat(service): add origin-lockdown + shared-token auth middleware"
```

---

## Task 4: Go save/filename (TDD) `[P with Task 2, Task 3]`

**Files:**
- Create: `service/internal/server/save.go`
- Test: `service/internal/server/save_test.go`

- [ ] **Step 1: Write the failing tests**

`service/internal/server/save_test.go`:

```go
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
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd service && go test ./internal/server/... -run 'Sanitize|BuildFilename|SaveFile'`
Expected: FAIL — `undefined: SanitizeShortname`, `undefined: BuildFilename`, `undefined: SaveFile`, `undefined: ErrNotPNG`.

- [ ] **Step 3: Write the implementation**

`service/internal/server/save.go`:

```go
package server

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var pngMagic = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}

var nonShortnameChars = regexp.MustCompile(`[^a-z0-9\-_]+`)

// SanitizeShortname lowercases the input, keeps only [a-z0-9-_], collapses
// runs of any other character into a single '-', trims leading/trailing '-',
// and caps the result at 40 characters. It may return "".
func SanitizeShortname(raw string) string {
	lower := strings.ToLower(raw)
	collapsed := nonShortnameChars.ReplaceAllString(lower, "-")
	trimmed := strings.Trim(collapsed, "-")
	if len(trimmed) > 40 {
		trimmed = trimmed[:40]
		trimmed = strings.Trim(trimmed, "-")
	}
	return trimmed
}

// BuildFilename returns "<time>.png" or "<time>_<shortname>.png".
func BuildFilename(t time.Time, shortname string) string {
	base := t.Format("2006-01-02_15-04-05")
	clean := SanitizeShortname(shortname)
	if clean == "" {
		return base + ".png"
	}
	return base + "_" + clean + ".png"
}

var ErrNotPNG = errors.New("save: content is not a valid PNG file")

// SaveFile validates that data begins with the PNG magic bytes, then writes
// it into dir under filename, avoiding collisions by appending -2, -3, ...
// (up to 100 attempts total) before the ".png" extension. It returns the
// absolute path of the file actually written.
func SaveFile(dir, filename string, data []byte) (string, error) {
	if len(data) < 8 || !bytes.Equal(data[:8], pngMagic) {
		return "", ErrNotPNG
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	ext := filepath.Ext(filename)
	stem := strings.TrimSuffix(filename, ext)

	const maxAttempts = 100
	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		candidate := filename
		if attempt > 0 {
			candidate = fmt.Sprintf("%s-%d%s", stem, attempt+1, ext)
		}
		fullPath := filepath.Join(dir, candidate)
		f, err := os.OpenFile(fullPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
		if err != nil {
			if os.IsExist(err) {
				lastErr = err
				continue
			}
			return "", err
		}
		_, writeErr := f.Write(data)
		closeErr := f.Close()
		if writeErr != nil {
			return "", writeErr
		}
		if closeErr != nil {
			return "", closeErr
		}
		return filepath.Abs(fullPath)
	}
	return "", fmt.Errorf("save: could not find free filename after %d attempts: %w", maxAttempts, lastErr)
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd service && go test ./internal/server/... -run 'Sanitize|BuildFilename|SaveFile' -v`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add service/internal/server/save.go service/internal/server/save_test.go
git commit -m "feat(service): add shortname sanitizing, filename building, and PNG-validated save"
```

---

## Task 5: Go server assembly + handlers (TDD) — after Task 2, Task 3, Task 4

**Files:**
- Create: `service/internal/server/handler.go`
- Create: `service/internal/server/server.go`
- Test: `service/internal/server/handler_test.go`
- Modify: `service/cmd/snapdropd/main.go`

- [ ] **Step 1: Write the failing handler tests (happy path + full error matrix)**

`service/internal/server/handler_test.go`:

```go
package server

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newMultipartUploadRequest(t *testing.T, fields map[string]string, imageField string, imageData []byte) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		if err := w.WriteField(k, v); err != nil {
			t.Fatalf("WriteField: %v", err)
		}
	}
	if imageField != "" {
		part, err := w.CreateFormFile(imageField, "shot.png")
		if err != nil {
			t.Fatalf("CreateFormFile: %v", err)
		}
		if _, err := part.Write(imageData); err != nil {
			t.Fatalf("Write image: %v", err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatalf("Close writer: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/upload", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Origin", "chrome-extension://abc123")
	req.Header.Set("X-Snapdrop-Token", "test-token")
	return req
}

func testMux(t *testing.T) (*http.ServeMux, string) {
	t.Helper()
	dir := t.TempDir()
	return NewMux("test-token", dir), dir
}

func TestUploadHappyPath(t *testing.T) {
	mux, _ := testMux(t)
	req := newMultipartUploadRequest(t, map[string]string{"shortname": "login-bug"}, "image", validPNGHeader)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Path     string `json:"path"`
		Filename string `json:"filename"`
		Bytes    int    `json:"bytes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("bad JSON response: %v", err)
	}
	if resp.Bytes != len(validPNGHeader) {
		t.Errorf("Bytes = %d, want %d", resp.Bytes, len(validPNGHeader))
	}
	if resp.Path == "" || resp.Filename == "" {
		t.Errorf("expected non-empty path and filename, got %+v", resp)
	}
}

func TestUploadMissingImage(t *testing.T) {
	mux, _ := testMux(t)
	req := newMultipartUploadRequest(t, map[string]string{}, "", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestUploadNotPNG(t *testing.T) {
	mux, _ := testMux(t)
	req := newMultipartUploadRequest(t, map[string]string{}, "image", []byte("not a png"))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestUploadWrongToken(t *testing.T) {
	mux, _ := testMux(t)
	req := newMultipartUploadRequest(t, map[string]string{}, "image", validPNGHeader)
	req.Header.Set("X-Snapdrop-Token", "wrong-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestUploadBadOrigin(t *testing.T) {
	mux, _ := testMux(t)
	req := newMultipartUploadRequest(t, map[string]string{}, "image", validPNGHeader)
	req.Header.Set("Origin", "https://evil.example.com")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestUploadOversize(t *testing.T) {
	dir := t.TempDir()
	handler := RecoverMiddleware(MaxBytesMiddleware(16, NewMux("test-token", dir)))
	req := newMultipartUploadRequest(t, map[string]string{}, "image", validPNGHeader)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestHealthz(t *testing.T) {
	mux, _ := testMux(t)
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	var resp struct {
		Status  string `json:"status"`
		Version string `json:"version"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("bad JSON: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status field = %q, want ok", resp.Status)
	}
	if resp.Version != "0.1.0" {
		t.Errorf("version field = %q, want 0.1.0", resp.Version)
	}
}

func TestHealthzRequiresNoAuth(t *testing.T) {
	mux, _ := testMux(t)
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	// Deliberately no Origin, no token header.
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d (healthz must not require auth)", rec.Code, http.StatusOK)
	}
}
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd service && go test ./internal/server/... -run 'Upload|Healthz'`
Expected: FAIL — `undefined: NewMux`, `undefined: RecoverMiddleware`, `undefined: MaxBytesMiddleware` (not implemented yet).

- [ ] **Step 3: Write the handler implementation**

`service/internal/server/handler.go`:

```go
package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"time"
)

const maxMemoryMultipart = 32 << 20 // in-memory threshold for multipart parsing

type UploadHandler struct {
	Dir string
	Now func() time.Time
}

func NewUploadHandler(dir string) *UploadHandler {
	return &UploadHandler{Dir: dir, Now: time.Now}
}

func (h *UploadHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := r.ParseMultipartForm(maxMemoryMultipart); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "upload too large")
			return
		}
		writeJSONError(w, http.StatusBadRequest, "malformed multipart body")
		return
	}

	file, _, err := r.FormFile("image")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "missing image field")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "could not read image field")
		return
	}

	shortname := r.FormValue("shortname")
	filename := BuildFilename(h.Now(), shortname)

	path, err := SaveFile(h.Dir, filename, data)
	if err != nil {
		if errors.Is(err, ErrNotPNG) {
			writeJSONError(w, http.StatusBadRequest, "image field is not a valid PNG")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "could not save file")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"path":     path,
		"filename": filepath.Base(path),
		"bytes":    len(data),
	})
}

func HealthzHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "version": "0.1.0"})
}
```

- [ ] **Step 4: Write the server assembly (mux + middleware chain + graceful shutdown)**

`service/internal/server/server.go`:

```go
package server

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// RecoverMiddleware converts panics in downstream handlers into 500
// responses instead of crashing the process.
func RecoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("recovered from panic: %v", rec)
				writeJSONError(w, http.StatusInternalServerError, "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// MaxBytesMiddleware caps the request body size before it reaches routing,
// so oversized uploads fail fast with 413 instead of being read into memory.
func MaxBytesMiddleware(maxBytes int64, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		next.ServeHTTP(w, r)
	})
}

// NewMux builds the routing table: /upload requires auth, /healthz does not.
func NewMux(token, dir string) *http.ServeMux {
	mux := http.NewServeMux()
	mux.Handle("/upload", AuthMiddleware(token, NewUploadHandler(dir)))
	mux.HandleFunc("/healthz", HealthzHandler)
	return mux
}

// NewServer wires the full middleware chain (recover -> maxbytes -> mux)
// around the routing table.
func NewServer(addr, token, dir string, maxBytes int64) *http.Server {
	mux := NewMux(token, dir)
	handler := RecoverMiddleware(MaxBytesMiddleware(maxBytes, mux))
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}
}

// Run starts srv and blocks until SIGINT/SIGTERM, then shuts it down gracefully.
func Run(srv *http.Server) error {
	errCh := make(chan error, 1)
	go func() {
		log.Printf("snapdropd listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		return err
	case <-sigCh:
		log.Println("shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(ctx)
	}
}
```

- [ ] **Step 5: Run and confirm pass**

Run: `cd service && go test ./internal/server/... -v`
Expected: PASS (all tests in the package, including the ones from Task 3 and Task 4).

- [ ] **Step 6: Wire main.go**

`service/cmd/snapdropd/main.go` (replaces the Task 1 stub):

```go
package main

import (
	"fmt"
	"log"
	"os"

	"snapdrop/service/internal/config"
	"snapdrop/service/internal/server"
	"snapdrop/service/internal/token"
)

func main() {
	if hasGenTokenFlag(os.Args[1:]) {
		tok, err := token.GenerateToken()
		if err != nil {
			log.Fatalf("could not generate token: %v", err)
		}
		fmt.Println(tok)
		return
	}

	cfg, err := config.Load(os.Args[1:], os.Getenv)
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	srv := server.NewServer(cfg.Addr, cfg.Token, cfg.Dir, cfg.MaxBytes)
	if err := server.Run(srv); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func hasGenTokenFlag(args []string) bool {
	for _, a := range args {
		if a == "-gen-token" || a == "--gen-token" {
			return true
		}
	}
	return false
}
```

- [ ] **Step 7: Build and smoke-test main**

Run:

```bash
cd service && go build -o bin/snapdropd ./cmd/snapdropd
./bin/snapdropd -gen-token
./bin/snapdropd -token=test -addr=127.0.0.1:19922 -dir=/tmp/snapdropd-smoke &
sleep 1
curl -s http://127.0.0.1:19922/healthz
kill %1
```

Expected: `-gen-token` prints a 43-character token; the healthz curl returns `{"status":"ok","version":"0.1.0"}`.

- [ ] **Step 8: Run the full Go test suite and vet**

Run: `cd service && go vet ./... && go test ./...`
Expected: `go vet` clean, all packages PASS.

- [ ] **Step 9: Commit**

```bash
git add service/internal/server/handler.go service/internal/server/server.go service/internal/server/handler_test.go service/cmd/snapdropd/main.go
git commit -m "feat(service): assemble HTTP server, /upload and /healthz handlers, main entrypoint"
```

---

## Task 6: systemd + install docs + static build target — after Task 5

**Files:**
- Modify: `service/Makefile`
- Create: `service/deploy/snapdropd.service`
- Create: `service/deploy/snapdrop.env.example`
- Create: `service/deploy/install.md`

- [ ] **Step 1: Strip the binary for a smaller static build**

Modify `service/Makefile`'s `build` target:

```makefile
.PHONY: build test

build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/snapdropd ./cmd/snapdropd

test:
	go test ./...
```

- [ ] **Step 2: Write the systemd unit**

`service/deploy/snapdropd.service`:

```ini
[Unit]
Description=Screenshot Drop receiving service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=hcadmin
Group=hcadmin
EnvironmentFile=/etc/snapdrop/snapdrop.env
ExecStart=/usr/local/bin/snapdropd
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=/home/hcadmin/screenshots
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 3: Write the env file example**

`service/deploy/snapdrop.env.example`:

```
SNAPDROP_ADDR=0.0.0.0:9922
SNAPDROP_DIR=/home/hcadmin/screenshots
SNAPDROP_TOKEN=replace-with-output-of-snapdropd--gen-token
```

- [ ] **Step 4: Write the install doc**

`service/deploy/install.md`:

```markdown
# Installing snapdropd on Computer B (Ubuntu)

1. Build the static binary (on any machine with Go 1.22+, or directly on
   Computer B):

   ```bash
   cd service
   make build
   ```

   This produces `service/bin/snapdropd`, a single static binary with no
   runtime dependencies.

2. Copy it to Computer B and install it:

   ```bash
   sudo install -m 0755 bin/snapdropd /usr/local/bin/snapdropd
   ```

3. Generate a shared token:

   ```bash
   snapdropd -gen-token
   ```

   Copy the printed value — you'll paste it into both the env file below
   and the extension's destination settings (Options page).

4. Create the config and screenshots directories:

   ```bash
   sudo mkdir -p /etc/snapdrop
   mkdir -p /home/hcadmin/screenshots
   ```

5. Create `/etc/snapdrop/snapdrop.env` from the example, filling in the
   token from step 3:

   ```bash
   sudo cp deploy/snapdrop.env.example /etc/snapdrop/snapdrop.env
   sudo chmod 600 /etc/snapdrop/snapdrop.env
   sudo $EDITOR /etc/snapdrop/snapdrop.env
   ```

6. Install and start the systemd unit:

   ```bash
   sudo cp deploy/snapdropd.service /etc/systemd/system/snapdropd.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now snapdropd
   ```

7. Verify locally on Computer B:

   ```bash
   sudo systemctl status snapdropd
   curl http://127.0.0.1:9922/healthz
   ```

   Expected: unit shows `active (running)`; curl returns
   `{"status":"ok","version":"0.1.0"}`.

8. Verify from Computer A over the LAN:

   ```bash
   curl http://<computer-b-lan-ip>:9922/healthz
   ```

   If this fails, check that Computer B's firewall (e.g. `ufw`) allows the
   configured port on the LAN interface.

9. In the extension's Options page, add a destination with this machine's
   name, `http://<computer-b-lan-ip>:9922` as the service address, and the
   token from step 3.
```

- [ ] **Step 5: Verify the static build**

Run:

```bash
cd service && make build
file bin/snapdropd
ldd bin/snapdropd
```

Expected: `file` reports a statically linked ELF executable; `ldd` reports `not a dynamic executable` (confirms `CGO_ENABLED=0` produced a fully static binary with no libc dependency).

- [ ] **Step 6: Commit**

```bash
git add service/Makefile service/deploy
git commit -m "docs(service): add systemd unit, env example, and install guide"
```

---

## Task 7: TS core geometry + annotations + tools (TDD vitest) `[P with Task 2, Task 3, Task 4]`

**Files:**
- Create: `extension/src/core/geometry.ts`
- Create: `extension/src/core/annotations.ts`
- Create: `extension/src/core/tools.ts`
- Test: `extension/tests/geometry.test.ts`
- Test: `extension/tests/annotations.test.ts`
- Test: `extension/tests/tools.test.ts`

None of these files may import any browser or `webextension-polyfill` API — they must run under plain Node.

- [ ] **Step 1: Write the failing geometry tests**

`extension/tests/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeRect, scaleRect, arrowHead, clampRectToBounds } from '../src/core/geometry';

describe('normalizeRect', () => {
  it('normalizes a rect dragged bottom-right to top-left', () => {
    const rect = normalizeRect({ x: 50, y: 50 }, { x: 10, y: 20 });
    expect(rect).toEqual({ x: 10, y: 20, width: 40, height: 30 });
  });

  it('normalizes a rect dragged top-left to bottom-right', () => {
    const rect = normalizeRect({ x: 10, y: 20 }, { x: 50, y: 50 });
    expect(rect).toEqual({ x: 10, y: 20, width: 40, height: 30 });
  });
});

describe('scaleRect', () => {
  it('scales all fields by dpr', () => {
    const rect = scaleRect({ x: 10, y: 20, width: 30, height: 40 }, 2);
    expect(rect).toEqual({ x: 20, y: 40, width: 60, height: 80 });
  });
});

describe('arrowHead', () => {
  it('returns two points near the arrow tip for a horizontal arrow', () => {
    const [left, right] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, Math.PI / 6);
    expect(left.x).toBeCloseTo(100 - 10 * Math.cos(Math.PI / 6));
    expect(left.y).toBeCloseTo(-10 * Math.sin(Math.PI / 6));
    expect(right.x).toBeCloseTo(100 - 10 * Math.cos(Math.PI / 6));
    expect(right.y).toBeCloseTo(10 * Math.sin(Math.PI / 6));
  });
});

describe('clampRectToBounds', () => {
  it('leaves an in-bounds rect unchanged', () => {
    const rect = clampRectToBounds({ x: 10, y: 10, width: 20, height: 20 }, { width: 100, height: 100 });
    expect(rect).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });

  it('clamps a rect that overflows the bounds', () => {
    const rect = clampRectToBounds({ x: 90, y: 90, width: 50, height: 50 }, { width: 100, height: 100 });
    expect(rect).toEqual({ x: 90, y: 90, width: 10, height: 10 });
  });

  it('clamps negative origin into bounds', () => {
    const rect = clampRectToBounds({ x: -10, y: -10, width: 20, height: 20 }, { width: 100, height: 100 });
    expect(rect).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd extension && npx vitest run tests/geometry.test.ts`
Expected: FAIL — cannot resolve `../src/core/geometry` (module doesn't exist yet).

- [ ] **Step 3: Write the geometry implementation**

`extension/src/core/geometry.ts`:

```ts
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Builds a normalized (non-negative width/height) rect from two drag points. */
export function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  return { x, y, width, height };
}

/** Scales a rect by a device-pixel-ratio factor (CSS px -> device px). */
export function scaleRect(rect: Rect, dpr: number): Rect {
  return {
    x: rect.x * dpr,
    y: rect.y * dpr,
    width: rect.width * dpr,
    height: rect.height * dpr
  };
}

/**
 * Returns the two short line segments that form an arrow head at `to`,
 * angled back toward `from`. `len` is the head segment length in px,
 * `angleRad` is the half-angle of the head in radians.
 */
export function arrowHead(from: Point, to: Point, len: number, angleRad: number): [Point, Point] {
  const theta = Math.atan2(to.y - from.y, to.x - from.x);
  const left: Point = {
    x: to.x - len * Math.cos(theta - angleRad),
    y: to.y - len * Math.sin(theta - angleRad)
  };
  const right: Point = {
    x: to.x - len * Math.cos(theta + angleRad),
    y: to.y - len * Math.sin(theta + angleRad)
  };
  return [left, right];
}

/** Clamps a rect so it lies fully within [0,0]-[bounds.width,bounds.height]. */
export function clampRectToBounds(rect: Rect, bounds: { width: number; height: number }): Rect {
  const x = Math.max(0, Math.min(rect.x, bounds.width));
  const y = Math.max(0, Math.min(rect.y, bounds.height));
  const maxWidth = bounds.width - x;
  const maxHeight = bounds.height - y;
  const width = Math.max(0, Math.min(rect.width, maxWidth));
  const height = Math.max(0, Math.min(rect.height, maxHeight));
  return { x, y, width, height };
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd extension && npx vitest run tests/geometry.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing annotations tests**

`extension/tests/annotations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AnnotationState, type Annotation } from '../src/core/annotations';

function makeArrow(): Annotation {
  return { tool: 'arrow', color: '#e5484d', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] };
}

describe('AnnotationState', () => {
  it('starts empty', () => {
    const state = new AnnotationState();
    expect(state.annotations).toEqual([]);
  });

  it('adds annotations in order', () => {
    const state = new AnnotationState();
    const a = makeArrow();
    const b: Annotation = { tool: 'pen', color: '#3b82f6', points: [{ x: 1, y: 1 }] };
    state.add(a);
    state.add(b);
    expect(state.annotations).toEqual([a, b]);
  });

  it('undo removes the most recently added annotation', () => {
    const state = new AnnotationState();
    state.add(makeArrow());
    state.add(makeArrow());
    state.undo();
    expect(state.annotations.length).toBe(1);
  });

  it('undo on empty state is a no-op', () => {
    const state = new AnnotationState();
    state.undo();
    expect(state.annotations).toEqual([]);
  });

  it('clear removes all annotations', () => {
    const state = new AnnotationState();
    state.add(makeArrow());
    state.add(makeArrow());
    state.clear();
    expect(state.annotations).toEqual([]);
  });
});
```

- [ ] **Step 6: Run and confirm failure**

Run: `cd extension && npx vitest run tests/annotations.test.ts`
Expected: FAIL — cannot resolve `../src/core/annotations`.

- [ ] **Step 7: Write the annotations implementation**

`extension/src/core/annotations.ts`:

```ts
import type { Point } from './geometry';

export type ToolKind = 'arrow' | 'rect' | 'line' | 'pen';

export interface Annotation {
  tool: ToolKind;
  color: string;
  points: Point[];
}

/** Mutable, undoable list of annotations drawn on a single capture. */
export class AnnotationState {
  private list: Annotation[] = [];

  add(annotation: Annotation): void {
    this.list.push(annotation);
  }

  undo(): void {
    this.list.pop();
  }

  clear(): void {
    this.list = [];
  }

  get annotations(): readonly Annotation[] {
    return this.list;
  }
}
```

- [ ] **Step 8: Run and confirm pass**

Run: `cd extension && npx vitest run tests/annotations.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Write the failing tools tests**

`extension/tests/tools.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TOOLS, COLORS, toolForKey, nextColor } from '../src/core/tools';

describe('TOOLS', () => {
  it('defines four tools bound to keys 1-4', () => {
    expect(TOOLS.map((t) => t.key)).toEqual(['1', '2', '3', '4']);
  });
});

describe('toolForKey', () => {
  it('resolves a known key to its tool id', () => {
    expect(toolForKey('2')).toBe('rect');
  });

  it('returns undefined for an unbound key', () => {
    expect(toolForKey('9')).toBeUndefined();
  });
});

describe('nextColor', () => {
  it('cycles from red to blue', () => {
    expect(nextColor(COLORS[0])).toBe(COLORS[1]);
  });

  it('cycles from blue back to red', () => {
    expect(nextColor(COLORS[1])).toBe(COLORS[0]);
  });

  it('defaults to the first color for an unknown current value', () => {
    expect(nextColor('#unknown')).toBe(COLORS[0]);
  });
});
```

- [ ] **Step 10: Run and confirm failure**

Run: `cd extension && npx vitest run tests/tools.test.ts`
Expected: FAIL — cannot resolve `../src/core/tools`.

- [ ] **Step 11: Write the tools implementation**

`extension/src/core/tools.ts`:

```ts
import type { ToolKind } from './annotations';

export interface ToolDef {
  id: ToolKind;
  label: string;
  key: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'arrow', label: 'Arrow', key: '1' },
  { id: 'rect', label: 'Rectangle', key: '2' },
  { id: 'line', label: 'Line', key: '3' },
  { id: 'pen', label: 'Pen', key: '4' }
];

export const COLORS = ['#e5484d', '#3b82f6'] as const;
export type ColorValue = (typeof COLORS)[number];

/** Looks up the tool bound to a keyboard key ('1'-'4'), or undefined. */
export function toolForKey(key: string): ToolKind | undefined {
  return TOOLS.find((t) => t.key === key)?.id;
}

/** Returns the color that follows `current` in the COLORS cycle (the 'c' key toggles). */
export function nextColor(current: string): ColorValue {
  const idx = COLORS.indexOf(current as ColorValue);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % COLORS.length;
  return COLORS[nextIdx];
}
```

- [ ] **Step 12: Run and confirm pass**

Run: `cd extension && npx vitest run tests/tools.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 13: Run the full core test suite and typecheck**

Run: `cd extension && npx vitest run tests/geometry.test.ts tests/annotations.test.ts tests/tools.test.ts && npm run typecheck`
Expected: all 17 tests PASS; `tsc --noEmit` reports no errors.

- [ ] **Step 14: Commit**

```bash
git add extension/src/core/geometry.ts extension/src/core/annotations.ts extension/src/core/tools.ts extension/tests/geometry.test.ts extension/tests/annotations.test.ts extension/tests/tools.test.ts
git commit -m "feat(extension): add framework-free geometry, annotation state, and tool definitions"
```

---

## Task 8: TS core renderer + editor + png + stitch — after Task 7

**Files:**
- Create: `extension/src/core/renderer.ts`
- Create: `extension/src/core/editor.ts`
- Create: `extension/src/core/png.ts`
- Create: `extension/src/core/stitch.ts`
- Test: `extension/tests/renderer.test.ts`
- Test: `extension/tests/editor.test.ts`
- Test: `extension/tests/stitch.test.ts`

`png.ts` has no dedicated unit test: it wraps `canvas.toBlob` / `OffscreenCanvas.convertToBlob`, both of which require a real browser Blob/canvas implementation not available in the Node vitest environment (the project intentionally avoids jsdom/canvas polyfill packages, per the note in the architecture). It is exercised manually in Task 12's save flow.

- [ ] **Step 1: Write the failing renderer tests (canvas ops smoke-tested with a hand-rolled stub)**

`extension/tests/renderer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render } from '../src/core/renderer';
import type { Annotation } from '../src/core/annotations';

function createStubCtx() {
  const calls: string[] = [];
  const props: Record<string, unknown> = {};
  const ctx = {
    canvas: { width: 100, height: 100 },
    clearRect: (...args: number[]) => calls.push(`clearRect:${args.join(',')}`),
    drawImage: (..._args: unknown[]) => calls.push('drawImage'),
    beginPath: () => calls.push('beginPath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo:${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo:${x},${y}`),
    stroke: () => calls.push('stroke'),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect:${x},${y},${w},${h}`),
    set strokeStyle(v: string) {
      props.strokeStyle = v;
    },
    get strokeStyle() {
      return props.strokeStyle as string;
    },
    set lineWidth(v: number) {
      props.lineWidth = v;
    },
    get lineWidth() {
      return props.lineWidth as number;
    },
    set lineCap(v: string) {
      props.lineCap = v;
    },
    get lineCap() {
      return props.lineCap as string;
    },
    set lineJoin(v: string) {
      props.lineJoin = v;
    },
    get lineJoin() {
      return props.lineJoin as string;
    }
  };
  return { ctx, calls };
}

const fakeImage = {} as CanvasImageSource;

describe('render', () => {
  it('clears and draws the base image before any annotations', () => {
    const { ctx, calls } = createStubCtx();
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, []);
    expect(calls[0]).toBe('clearRect:0,0,100,100');
    expect(calls[1]).toBe('drawImage');
  });

  it('draws a rect annotation with strokeRect', () => {
    const { ctx, calls } = createStubCtx();
    const annotation: Annotation = { tool: 'rect', color: '#e5484d', points: [{ x: 5, y: 5 }, { x: 25, y: 15 }] };
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [annotation]);
    expect(calls).toContain('strokeRect:5,5,20,10');
  });

  it('draws a pen annotation as a connected polyline', () => {
    const { ctx, calls } = createStubCtx();
    const annotation: Annotation = {
      tool: 'pen',
      color: '#3b82f6',
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]
    };
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [annotation]);
    expect(calls).toContain('moveTo:0,0');
    expect(calls).toContain('lineTo:1,1');
    expect(calls).toContain('lineTo:2,2');
  });

  it('draws an arrow as a line plus two head strokes', () => {
    const { ctx, calls } = createStubCtx();
    const annotation: Annotation = { tool: 'arrow', color: '#e5484d', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [annotation]);
    const strokeCount = calls.filter((c) => c === 'stroke').length;
    expect(strokeCount).toBe(3); // shaft + two head segments
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd extension && npx vitest run tests/renderer.test.ts`
Expected: FAIL — cannot resolve `../src/core/renderer`.

- [ ] **Step 3: Write the renderer implementation**

`extension/src/core/renderer.ts`:

```ts
import type { Annotation } from './annotations';
import { arrowHead } from './geometry';

export interface RenderOptions {
  lineWidth?: number;
}

const DEFAULT_LINE_WIDTH = 3;
const ARROW_HEAD_LENGTH = 14;
const ARROW_HEAD_ANGLE = Math.PI / 7;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draws the base image, then each annotation on top, in immediate mode. */
export function render(
  ctx: Ctx2D,
  baseImage: CanvasImageSource,
  annotations: readonly Annotation[],
  opts: RenderOptions = {}
): void {
  const canvas = ctx.canvas as { width: number; height: number };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseImage, 0, 0);

  const lineWidth = opts.lineWidth ?? DEFAULT_LINE_WIDTH;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const annotation of annotations) {
    drawAnnotation(ctx, annotation);
  }
}

function drawAnnotation(ctx: Ctx2D, annotation: Annotation): void {
  ctx.strokeStyle = annotation.color;
  switch (annotation.tool) {
    case 'line':
    case 'rect':
      drawShape(ctx, annotation);
      break;
    case 'arrow':
      drawArrow(ctx, annotation);
      break;
    case 'pen':
      drawPen(ctx, annotation);
      break;
  }
}

function drawShape(ctx: Ctx2D, annotation: Annotation): void {
  const [start, end] = annotation.points;
  if (!start || !end) return;
  ctx.beginPath();
  if (annotation.tool === 'rect') {
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
}

function drawArrow(ctx: Ctx2D, annotation: Annotation): void {
  const [start, end] = annotation.points;
  if (!start || !end) return;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  const [left, right] = arrowHead(start, end, ARROW_HEAD_LENGTH, ARROW_HEAD_ANGLE);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(left.x, left.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();
}

function drawPen(ctx: Ctx2D, annotation: Annotation): void {
  if (annotation.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
  for (const point of annotation.points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd extension && npx vitest run tests/renderer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write png.ts (no dedicated test — see rationale above)**

`extension/src/core/png.ts`:

```ts
/** Converts a canvas to a PNG Blob. Works with both HTMLCanvasElement and OffscreenCanvas. */
export function canvasToPngBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvasToPngBlob: toBlob returned null'));
    }, 'image/png');
  });
}
```

- [ ] **Step 6: Write the failing editor tests (state transitions via synthetic pointer events)**

`extension/tests/editor.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AnnotationEditor } from '../src/core/editor';

function createStubCanvas() {
  const ctx = {
    canvas: { width: 10, height: 10 },
    clearRect: () => {},
    drawImage: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    strokeRect: () => {},
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: ''
  };
  const canvas = {
    width: 10,
    height: 10,
    getContext: (kind: string) => (kind === '2d' ? ctx : null)
  };
  return canvas as unknown as HTMLCanvasElement;
}

const fakeImage = {} as CanvasImageSource;

describe('AnnotationEditor', () => {
  let editor: AnnotationEditor;

  beforeEach(() => {
    editor = new AnnotationEditor({ canvas: createStubCanvas(), image: fakeImage });
  });

  it('starts with the arrow tool and red color', () => {
    expect(editor.currentTool).toBe('arrow');
    expect(editor.currentColor).toBe('#e5484d');
  });

  it('setTool changes the active tool', () => {
    editor.setTool('pen');
    expect(editor.currentTool).toBe('pen');
  });

  it('setColor changes the active color', () => {
    editor.setColor('#3b82f6');
    expect(editor.currentColor).toBe('#3b82f6');
  });

  it('a pointer down/up cycle commits one annotation with start and end points', () => {
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerMove({ x: 5, y: 5 });
    editor.pointerUp();
    expect(editor.annotations.length).toBe(1);
    expect(editor.annotations[0].points).toEqual([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
  });

  it('pen tool accumulates every point moved through', () => {
    editor.setTool('pen');
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerMove({ x: 1, y: 1 });
    editor.pointerMove({ x: 2, y: 2 });
    editor.pointerUp();
    expect(editor.annotations[0].points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
  });

  it('undo removes the last committed annotation', () => {
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerUp();
    editor.undo();
    expect(editor.annotations.length).toBe(0);
  });

  it('clear removes all annotations', () => {
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerUp();
    editor.pointerDown({ x: 1, y: 1 });
    editor.pointerUp();
    editor.clear();
    expect(editor.annotations.length).toBe(0);
  });

  it('pointerMove before pointerDown is a no-op', () => {
    editor.pointerMove({ x: 9, y: 9 });
    editor.pointerUp();
    expect(editor.annotations.length).toBe(0);
  });
});
```

- [ ] **Step 7: Run and confirm failure**

Run: `cd extension && npx vitest run tests/editor.test.ts`
Expected: FAIL — cannot resolve `../src/core/editor`.

- [ ] **Step 8: Write the editor implementation**

`extension/src/core/editor.ts`:

```ts
import type { Point } from './geometry';
import { AnnotationState, type Annotation, type ToolKind } from './annotations';
import { render } from './renderer';
import { canvasToPngBlob } from './png';

export interface AnnotationEditorOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  image: CanvasImageSource;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Drives freehand/shape annotation over a base image on a canvas.
 * Framework-free: no browser-extension APIs, only DOM/canvas primitives
 * (so it can host inside a Wails webview unchanged).
 */
export class AnnotationEditor {
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private image: CanvasImageSource;
  private ctx: Ctx2D;
  private state = new AnnotationState();
  private tool: ToolKind = 'arrow';
  private color = '#e5484d';
  private drawing = false;
  private current: Annotation | null = null;

  constructor(opts: AnnotationEditorOptions) {
    this.canvas = opts.canvas;
    this.image = opts.image;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('AnnotationEditor: could not get 2d context');
    this.ctx = ctx as Ctx2D;
    this.redraw();
  }

  setTool(tool: ToolKind): void {
    this.tool = tool;
  }

  setColor(color: string): void {
    this.color = color;
  }

  get currentTool(): ToolKind {
    return this.tool;
  }

  get currentColor(): string {
    return this.color;
  }

  pointerDown(point: Point): void {
    this.drawing = true;
    this.current = { tool: this.tool, color: this.color, points: [point, point] };
  }

  pointerMove(point: Point): void {
    if (!this.drawing || !this.current) return;
    if (this.tool === 'pen') {
      this.current.points.push(point);
    } else {
      this.current.points[1] = point;
    }
    this.redraw();
  }

  pointerUp(): void {
    if (!this.drawing || !this.current) return;
    this.state.add(this.current);
    this.current = null;
    this.drawing = false;
    this.redraw();
  }

  undo(): void {
    this.state.undo();
    this.redraw();
  }

  clear(): void {
    this.state.clear();
    this.redraw();
  }

  get annotations(): readonly Annotation[] {
    return this.state.annotations;
  }

  toBlob(): Promise<Blob> {
    return canvasToPngBlob(this.canvas);
  }

  private redraw(): void {
    const live = this.current ? [...this.state.annotations, this.current] : this.state.annotations;
    render(this.ctx, this.image, live);
  }
}
```

- [ ] **Step 9: Run and confirm pass**

Run: `cd extension && npx vitest run tests/editor.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 10: Write the failing stitch tests (pure plan/math + stub-recorded draw calls)**

`extension/tests/stitch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planScrollCapture, stitchTiles, type Tile } from '../src/core/stitch';

describe('planScrollCapture', () => {
  it('returns a single offset when the page fits in one viewport', () => {
    expect(planScrollCapture(800, 800)).toEqual([0]);
    expect(planScrollCapture(800, 500)).toEqual([0]);
  });

  it('handles a page height that is an exact multiple of the viewport height', () => {
    expect(planScrollCapture(500, 1500)).toEqual([0, 500, 1000]);
  });

  it('adds a final partial-tile offset for non-evenly-divisible pages', () => {
    expect(planScrollCapture(500, 1200)).toEqual([0, 500, 700]);
  });

  it('does not duplicate the final offset when it already lands on a step', () => {
    const offsets = planScrollCapture(400, 1600);
    expect(offsets).toEqual([0, 400, 800, 1200]);
    expect(new Set(offsets).size).toBe(offsets.length);
  });
});

describe('stitchTiles', () => {
  function createStubCtx() {
    const calls: string[] = [];
    const canvas = { width: 0, height: 0 };
    const ctx = {
      canvas,
      drawImage: (_img: unknown, x: number, y: number) => calls.push(`drawImage:${x},${y}`)
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, canvas, calls };
  }

  it('resizes the canvas to totalWidth/height scaled by dpr', () => {
    const { ctx, canvas } = createStubCtx();
    stitchTiles(ctx, [], 400, 900, 2);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(1800);
  });

  it('draws each tile at its y offset scaled by dpr', () => {
    const { ctx, calls } = createStubCtx();
    const tiles: Tile[] = [
      { image: {} as CanvasImageSource, y: 0 },
      { image: {} as CanvasImageSource, y: 500 }
    ];
    stitchTiles(ctx, tiles, 400, 1000, 2);
    expect(calls).toEqual(['drawImage:0,0', 'drawImage:0,1000']);
  });
});
```

- [ ] **Step 11: Run and confirm failure**

Run: `cd extension && npx vitest run tests/stitch.test.ts`
Expected: FAIL — cannot resolve `../src/core/stitch`.

- [ ] **Step 12: Write the stitch implementation**

`extension/src/core/stitch.ts`:

```ts
export interface Tile {
  image: CanvasImageSource;
  y: number;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draws each tile onto ctx.canvas at its recorded y offset (scaled by dpr),
 * producing one stitched full-page image. Resizes ctx.canvas to
 * totalWidth*dpr x totalHeight*dpr before drawing.
 */
export function stitchTiles(ctx: Ctx2D, tiles: Tile[], totalWidth: number, totalHeight: number, dpr: number): void {
  const canvas = ctx.canvas as { width: number; height: number };
  canvas.width = Math.round(totalWidth * dpr);
  canvas.height = Math.round(totalHeight * dpr);
  for (const tile of tiles) {
    ctx.drawImage(tile.image, 0, Math.round(tile.y * dpr));
  }
}

/**
 * Plans the vertical scroll offsets needed to cover a page of `totalHeight`
 * using a viewport of `viewportHeight`, capturing once per offset. The final
 * offset is adjusted so the last tile's bottom edge lines up with the page
 * bottom (totalHeight - viewportHeight), deduped if it coincides with the
 * last full-step offset already produced.
 */
export function planScrollCapture(viewportHeight: number, totalHeight: number): number[] {
  if (totalHeight <= viewportHeight) {
    return [0];
  }
  const offsets: number[] = [];
  let y = 0;
  while (y < totalHeight - viewportHeight) {
    offsets.push(y);
    y += viewportHeight;
  }
  const lastOffset = totalHeight - viewportHeight;
  if (offsets[offsets.length - 1] !== lastOffset) {
    offsets.push(lastOffset);
  }
  return offsets;
}
```

- [ ] **Step 13: Run and confirm pass**

Run: `cd extension && npx vitest run tests/stitch.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 14: Run the full extension test suite and typecheck**

Run: `cd extension && npm test && npm run typecheck`
Expected: all tests across `tests/` PASS (37 total so far); typecheck clean.

> **Deviation from the architecture doc:** `stitchTiles`'s signature is `(ctx, tiles, totalWidth, totalHeight, dpr)` rather than `(tiles, totalWidth, totalHeight, dpr)` with an implicit canvas. The function must draw onto a caller-provided canvas/context (as the architecture doc itself says: "draws onto provided canvas/ctx"), so a `ctx` parameter is required; it is placed first to match the common `ctx`-leading convention used by `render()` in this same file set.

- [ ] **Step 15: Commit**

```bash
git add extension/src/core/renderer.ts extension/src/core/editor.ts extension/src/core/png.ts extension/src/core/stitch.ts extension/tests/renderer.test.ts extension/tests/editor.test.ts extension/tests/stitch.test.ts
git commit -m "feat(extension): add renderer, annotation editor, png export, and full-page stitching"
```

---

## Task 9: TS platform transport + store (TDD) `[P with Task 8]`

**Files:**
- Create: `extension/src/platform/transport.ts`
- Create: `extension/src/platform/transport-http.ts`
- Create: `extension/src/platform/store.ts`
- Create: `extension/src/platform/store-webext.ts`
- Test: `extension/tests/transport.test.ts`
- Test: `extension/tests/store.test.ts`

These tests rely on Node 18+'s built-in `fetch`, `Response`, `FormData`, and `Blob` globals (no jsdom, no polyfills) — the `engines.node >= 18` constraint set in Task 1 covers this.

- [ ] **Step 1: Write transport.ts (types only — no logic to test yet)**

`extension/src/platform/transport.ts`:

```ts
export interface Destination {
  id: string;
  name: string;
  url: string;
  token: string;
}

export interface UploadResult {
  path: string;
  filename: string;
  bytes: number;
}

export type UploadErrorKind = 'auth' | 'network' | 'server' | 'bad-response';

export class UploadError extends Error {
  kind: UploadErrorKind;

  constructor(kind: UploadErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'UploadError';
  }
}

export interface Transport {
  upload(dest: Destination, png: Blob, shortname: string): Promise<UploadResult>;
}
```

- [ ] **Step 2: Write the failing transport-http tests**

`extension/tests/transport.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpTransport } from '../src/platform/transport-http';
import { UploadError, type Destination } from '../src/platform/transport';

const dest: Destination = { id: 'd1', name: 'HCA-Worker-01', url: 'http://10.2.50.13:9922', token: 'tok123' };
const png = new Blob(['fake-png-bytes'], { type: 'image/png' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpTransport.upload', () => {
  it('POSTs to <url>/upload with the token header and multipart fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ path: '/abs/shot.png', filename: 'shot.png', bytes: 5 }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new HttpTransport().upload(dest, png, 'login-bug');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://10.2.50.13:9922/upload');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Snapdrop-Token']).toBe('tok123');

    const form = init.body as FormData;
    expect(form.get('image')).toBeInstanceOf(Blob);
    expect(form.get('shortname')).toBe('login-bug');

    expect(result).toEqual({ path: '/abs/shot.png', filename: 'shot.png', bytes: 5 });
  });

  it('throws an auth UploadError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('throws an auth UploadError on 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('throws a network UploadError when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toMatchObject({ kind: 'network' });
  });

  it('throws a server UploadError on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toMatchObject({ kind: 'server' });
  });

  it('throws a bad-response UploadError on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('throws a bad-response UploadError when required fields are missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ path: '/x' }), { status: 200 })));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toBeInstanceOf(UploadError);
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `cd extension && npx vitest run tests/transport.test.ts`
Expected: FAIL — cannot resolve `../src/platform/transport-http`.

- [ ] **Step 4: Write the transport-http implementation**

`extension/src/platform/transport-http.ts`:

```ts
import type { Destination, Transport, UploadResult } from './transport';
import { UploadError } from './transport';

export class HttpTransport implements Transport {
  async upload(dest: Destination, png: Blob, shortname: string): Promise<UploadResult> {
    const form = new FormData();
    form.append('image', png, 'shot.png');
    form.append('shortname', shortname);

    let response: Response;
    try {
      response = await fetch(`${dest.url}/upload`, {
        method: 'POST',
        headers: { 'X-Snapdrop-Token': dest.token },
        body: form
      });
    } catch {
      throw new UploadError('network', `Could not reach ${dest.name} at ${dest.url}`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new UploadError('auth', `${dest.name} rejected the request (check the token)`);
    }

    if (!response.ok) {
      throw new UploadError('server', `${dest.name} returned status ${response.status}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new UploadError('bad-response', `${dest.name} returned a response that was not valid JSON`);
    }

    if (
      typeof data !== 'object' ||
      data === null ||
      typeof (data as UploadResult).path !== 'string' ||
      typeof (data as UploadResult).filename !== 'string' ||
      typeof (data as UploadResult).bytes !== 'number'
    ) {
      throw new UploadError('bad-response', `${dest.name} returned an unexpected response shape`);
    }

    return data as UploadResult;
  }
}
```

- [ ] **Step 5: Run and confirm pass**

Run: `cd extension && npx vitest run tests/transport.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Write store.ts (interface only)**

`extension/src/platform/store.ts`:

```ts
import type { Destination } from './transport';

export interface DestinationStore {
  list(): Promise<Destination[]>;
  save(d: Destination): Promise<void>;
  remove(id: string): Promise<void>;
  getLastUsedId(): Promise<string | null>;
  setLastUsedId(id: string): Promise<void>;
}
```

- [ ] **Step 7: Write the failing store-webext tests**

`extension/tests/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { WebextStore, type StorageArea } from '../src/platform/store-webext';
import type { Destination } from '../src/platform/transport';

function createStubStorage(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    async get(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) out[k] = data[k];
      return out;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    }
  };
}

const dest1: Destination = { id: 'd1', name: 'HCA-Worker-01', url: 'http://10.2.50.13:9922', token: 't1' };
const dest2: Destination = { id: 'd2', name: 'HCA-Worker-02', url: 'http://10.2.50.14:9922', token: 't2' };

describe('WebextStore', () => {
  let store: WebextStore;

  beforeEach(() => {
    store = new WebextStore(createStubStorage());
  });

  it('list returns an empty array when nothing is saved', async () => {
    expect(await store.list()).toEqual([]);
  });

  it('save adds a new destination', async () => {
    await store.save(dest1);
    expect(await store.list()).toEqual([dest1]);
  });

  it('save updates an existing destination with the same id', async () => {
    await store.save(dest1);
    const updated = { ...dest1, name: 'Renamed' };
    await store.save(updated);
    const list = await store.list();
    expect(list).toEqual([updated]);
  });

  it('remove deletes a destination by id', async () => {
    await store.save(dest1);
    await store.save(dest2);
    await store.remove(dest1.id);
    expect(await store.list()).toEqual([dest2]);
  });

  it('getLastUsedId returns null when never set', async () => {
    expect(await store.getLastUsedId()).toBeNull();
  });

  it('setLastUsedId then getLastUsedId round-trips', async () => {
    await store.setLastUsedId('d2');
    expect(await store.getLastUsedId()).toBe('d2');
  });
});
```

- [ ] **Step 8: Run and confirm failure**

Run: `cd extension && npx vitest run tests/store.test.ts`
Expected: FAIL — cannot resolve `../src/platform/store-webext`.

- [ ] **Step 9: Write the store-webext implementation**

`extension/src/platform/store-webext.ts`:

```ts
import type { Destination } from './transport';
import type { DestinationStore } from './store';

const DESTINATIONS_KEY = 'destinations';
const LAST_USED_KEY = 'lastUsedDestinationId';

export interface StorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** DestinationStore backed by browser.storage.local (or an injected stub for tests). */
export class WebextStore implements DestinationStore {
  constructor(private storage: StorageArea) {}

  async list(): Promise<Destination[]> {
    const result = await this.storage.get(DESTINATIONS_KEY);
    return (result[DESTINATIONS_KEY] as Destination[] | undefined) ?? [];
  }

  async save(d: Destination): Promise<void> {
    const existing = await this.list();
    const idx = existing.findIndex((x) => x.id === d.id);
    if (idx === -1) {
      existing.push(d);
    } else {
      existing[idx] = d;
    }
    await this.storage.set({ [DESTINATIONS_KEY]: existing });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.list();
    const filtered = existing.filter((x) => x.id !== id);
    await this.storage.set({ [DESTINATIONS_KEY]: filtered });
  }

  async getLastUsedId(): Promise<string | null> {
    const result = await this.storage.get(LAST_USED_KEY);
    return (result[LAST_USED_KEY] as string | undefined) ?? null;
  }

  async setLastUsedId(id: string): Promise<void> {
    await this.storage.set({ [LAST_USED_KEY]: id });
  }
}
```

- [ ] **Step 10: Run and confirm pass**

Run: `cd extension && npx vitest run tests/store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 11: Run the full extension test suite and typecheck**

Run: `cd extension && npm test && npm run typecheck`
Expected: all tests PASS (50 total so far); typecheck clean.

- [ ] **Step 12: Commit**

```bash
git add extension/src/platform extension/tests/transport.test.ts extension/tests/store.test.ts
git commit -m "feat(extension): add HTTP transport and webext-storage-backed destination store"
```

---

## Task 10: ext background + popup + visible/marked capture (+ overlay content script) — after Task 8, Task 9

**Files:**
- Create: `extension/src/ext/browser.ts`
- Create: `extension/src/ext/messaging.ts`
- Create: `extension/src/ext/capture/visible.ts`
- Create: `extension/src/ext/capture/marked.ts`
- Modify: `extension/src/ext/overlay.content.ts`
- Modify: `extension/src/ext/background.ts`
- Modify: `extension/src/ext/popup.entry.ts`
- Modify: `extension/public/popup.html`
- Modify: `extension/src/styles/popup.css`

This is browser-glue code exercised via build + manual verification, not vitest (no DOM/extension APIs in the Node test environment).

- [ ] **Step 1: Write the browser re-export**

`extension/src/ext/browser.ts`:

```ts
import browser from 'webextension-polyfill';

export default browser;
```

- [ ] **Step 2: Write the messaging types**

`extension/src/ext/messaging.ts`:

```ts
import type { Rect } from '../core/geometry';

export type CaptureMode = 'visible' | 'full' | 'marked';

export interface CaptureMessage {
  type: 'capture';
  mode: CaptureMode;
}

export interface RegionMessage {
  type: 'region';
  rect: Rect;
  dpr: number;
}

export interface GetCaptureMessage {
  type: 'get-capture';
  id: string;
}

export type ExtensionMessage = CaptureMessage | RegionMessage | GetCaptureMessage;

export const CAPTURE_STORAGE_PREFIX = 'capture:';

export function captureStorageKey(id: string): string {
  return `${CAPTURE_STORAGE_PREFIX}${id}`;
}
```

- [ ] **Step 3: Write the visible-tab capture**

`extension/src/ext/capture/visible.ts`:

```ts
import browser from '../browser';

/** Captures the visible area of the given window as a PNG data URL. */
export async function captureVisible(windowId: number): Promise<string> {
  return browser.tabs.captureVisibleTab(windowId, { format: 'png' });
}
```

- [ ] **Step 4: Write the overlay content script**

`extension/src/ext/overlay.content.ts` (replaces the Task 1 stub):

```ts
import browser from './browser';
import type { RegionMessage } from './messaging';

const OVERLAY_ID = 'snapdrop-overlay-marquee';

function removeOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

function installOverlay(): void {
  removeOverlay();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'crosshair',
    background: 'rgba(0, 0, 0, 0.3)'
  });

  const marquee = document.createElement('div');
  Object.assign(marquee.style, {
    position: 'fixed',
    border: '2px dashed #fff',
    display: 'none'
  });
  overlay.appendChild(marquee);
  document.documentElement.appendChild(overlay);

  let start: { x: number; y: number } | null = null;

  function onMouseDown(e: MouseEvent): void {
    start = { x: e.clientX, y: e.clientY };
    marquee.style.display = 'block';
  }

  function onMouseMove(e: MouseEvent): void {
    if (!start) return;
    const x = Math.min(start.x, e.clientX);
    const y = Math.min(start.y, e.clientY);
    const width = Math.abs(e.clientX - start.x);
    const height = Math.abs(e.clientY - start.y);
    Object.assign(marquee.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`
    });
  }

  async function onMouseUp(e: MouseEvent): Promise<void> {
    if (!start) return;
    const x = Math.min(start.x, e.clientX);
    const y = Math.min(start.y, e.clientY);
    const width = Math.abs(e.clientX - start.x);
    const height = Math.abs(e.clientY - start.y);
    const dpr = window.devicePixelRatio;
    start = null;

    removeOverlay();
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));

    const message: RegionMessage = { type: 'region', rect: { x, y, width, height }, dpr };
    await browser.runtime.sendMessage(message);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      removeOverlay();
      document.removeEventListener('keydown', onKeyDown);
    }
  }

  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
}

installOverlay();
```

- [ ] **Step 5: Write the marked-area capture**

`extension/src/ext/capture/marked.ts`:

```ts
import browser from '../browser';
import type { Rect } from '../../core/geometry';
import { scaleRect } from '../../core/geometry';
import type { RegionMessage } from '../messaging';

/** Waits for a single 'region' message from the content script, then resolves its rect/dpr. */
function waitForRegion(): Promise<RegionMessage> {
  return new Promise((resolve) => {
    function listener(message: unknown) {
      const msg = message as RegionMessage;
      if (msg && msg.type === 'region') {
        browser.runtime.onMessage.removeListener(listener);
        resolve(msg);
      }
    }
    browser.runtime.onMessage.addListener(listener);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function cropDataUrl(dataUrl: string, rect: Rect): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  let canvas: OffscreenCanvas | HTMLCanvasElement;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(rect.width, rect.height);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

  if ('convertToBlob' in canvas) {
    const croppedBlob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
    return blobToDataUrl(croppedBlob);
  }
  return (canvas as HTMLCanvasElement).toDataURL('image/png');
}

/**
 * Injects the marquee overlay into tabId, waits for the user's drag, then
 * captures the visible tab and crops it to the marked region.
 */
export async function captureMarked(tabId: number, windowId: number): Promise<string> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['overlay.content.js']
  });

  const region = await waitForRegion();
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  const deviceRect = scaleRect(region.rect, region.dpr);
  return cropDataUrl(dataUrl, deviceRect);
}
```

- [ ] **Step 6: Write the background service worker**

`extension/src/ext/background.ts` (replaces the Task 1 stub):

```ts
import browser from './browser';
import type { CaptureMessage } from './messaging';
import { captureStorageKey } from './messaging';
import { captureVisible } from './capture/visible';
import { captureMarked } from './capture/marked';

async function runCapture(mode: CaptureMessage['mode'], tab: { id?: number; windowId?: number }): Promise<string> {
  if (tab.windowId === undefined) throw new Error('background: active tab has no windowId');
  if (mode === 'visible') {
    return captureVisible(tab.windowId);
  }
  if (mode === 'marked') {
    if (tab.id === undefined) throw new Error('background: active tab has no id');
    return captureMarked(tab.id, tab.windowId);
  }
  throw new Error(`background: mode "${mode}" is added in Task 11`);
}

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as CaptureMessage;
  if (!msg || msg.type !== 'capture') return undefined;

  return (async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('background: no active tab');

    try {
      const dataUrl = await runCapture(msg.mode, tab);
      const id = crypto.randomUUID();
      await browser.storage.session.set({ [captureStorageKey(id)]: dataUrl });
      await browser.tabs.create({ url: `annotate.html?id=${id}` });
    } catch (err) {
      console.error('screenshot-drop: capture failed', err);
    }
  })();
});
```

(The `'full'` mode is intentionally left as a thrown error here — Task 11 replaces `runCapture`'s body with a full switch over all three modes.)

- [ ] **Step 7: Write the popup entry**

`extension/src/ext/popup.entry.ts` (replaces the Task 1 stub):

```ts
import browser from './browser';
import type { CaptureMessage, CaptureMode } from './messaging';

function bindButton(id: string, mode: CaptureMode): void {
  const button = document.getElementById(id);
  button?.addEventListener('click', async () => {
    const message: CaptureMessage = { type: 'capture', mode };
    await browser.runtime.sendMessage(message);
    window.close();
  });
}

bindButton('capture-full', 'full');
bindButton('capture-visible', 'visible');
bindButton('capture-marked', 'marked');
```

- [ ] **Step 8: Update the popup HTML and styles**

`extension/public/popup.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="styles/popup.css" />
  </head>
  <body>
    <div id="app">
      <button id="capture-full">Full page</button>
      <button id="capture-visible">Visible tab</button>
      <button id="capture-marked">Marked area</button>
    </div>
    <script src="popup.entry.js"></script>
  </body>
</html>
```

`extension/src/styles/popup.css`:

```css
body {
  margin: 0;
  width: 220px;
  font-family: system-ui, sans-serif;
}

#app {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

button {
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
}
```

- [ ] **Step 9: Build both targets and typecheck**

Run: `cd extension && npm run typecheck && npm run build`
Expected: no type errors; `dist/chromium` and `dist/firefox` rebuild successfully with the updated `background.js`, `popup.entry.js`, and `overlay.content.js` bundles.

- [ ] **Step 10: Manual verification checklist (Brave, then Firefox)**

1. Brave: open `brave://extensions`, enable Developer Mode, "Load unpacked", select `extension/dist/chromium`.
2. Firefox: open `about:debugging#/runtime/this-firefox`, "Load Temporary Add-on", select any file in `extension/dist/firefox` (e.g. `manifest.json`).
3. In each browser: click the toolbar icon, click **Visible tab**. Confirm a new tab opens at `annotate.html?id=<uuid>` (it will render blank/stub content until Task 12 — that's expected at this stage).
4. Open the extension's service worker/background console (Brave: `brave://extensions` → "service worker" link; Firefox: the debugging page's "Inspect" button) and confirm no uncaught errors were logged during the capture.
5. Inspect storage: in the background console, run `await browser.storage.session.get()` and confirm a key like `capture:<uuid>` holding a `data:image/png;base64,...` string is present.
6. Click **Marked area**. Confirm the semi-transparent overlay with crosshair cursor appears over the page; drag a rectangle and confirm the dashed marquee follows the drag. On mouse-up, confirm the overlay disappears and a new annotate tab opens (again blank until Task 12), and that `browser.storage.session` now holds a second capture entry.
7. Press `Escape` while the marked-area overlay is active and confirm it disappears without opening a new tab.

- [ ] **Step 11: Commit**

```bash
git add extension/src/ext/browser.ts extension/src/ext/messaging.ts extension/src/ext/capture/visible.ts extension/src/ext/capture/marked.ts extension/src/ext/overlay.content.ts extension/src/ext/background.ts extension/src/ext/popup.entry.ts extension/public/popup.html extension/src/styles/popup.css
git commit -m "feat(extension): wire background, popup, visible-tab and marked-area capture"
```

---

## Task 11: ext full-page capture (both browsers) + stitch fallback — after Task 10

**Files:**
- Create: `extension/src/ext/capture/fullpage.ts`
- Modify: `extension/src/ext/background.ts`

- [ ] **Step 1: Write the full-page capture module**

`extension/src/ext/capture/fullpage.ts`:

```ts
import browser from '../browser';
import { planScrollCapture, stitchTiles, type Tile } from '../../core/stitch';

declare const __TARGET__: 'chromium' | 'firefox';

interface DocumentSize {
  width: number;
  height: number;
  viewportHeight: number;
}

async function readDocumentSize(tabId: number): Promise<DocumentSize> {
  const [{ result }] = await browser.scripting.executeScript({
    target: { tabId },
    func: () => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight
    })
  });
  return result as DocumentSize;
}

async function captureFullPageFirefox(tabId: number): Promise<string> {
  const size = await readDocumentSize(tabId);
  return (
    browser.tabs as unknown as {
      captureTab(
        tabId: number,
        opts: { rect: { x: number; y: number; width: number; height: number }; format: string }
      ): Promise<string>;
    }
  ).captureTab(tabId, {
    rect: { x: 0, y: 0, width: size.width, height: size.height },
    format: 'png'
  });
}

interface DebuggerLayoutMetrics {
  cssContentSize: { width: number; height: number };
}

async function captureFullPageChromiumViaDebugger(tabId: number): Promise<string> {
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');
  try {
    const metrics = (await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics')) as DebuggerLayoutMetrics;
    const { width, height } = metrics.cssContentSize;
    const result = (await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 }
    })) as { data: string };
    return `data:image/png;base64,${result.data}`;
  } finally {
    await chrome.debugger.detach(target);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function captureFullPageChromiumViaStitch(tabId: number, windowId: number): Promise<string> {
  const size = await readDocumentSize(tabId);
  const offsets = planScrollCapture(size.viewportHeight, size.height);

  const tiles: Tile[] = [];
  for (const offset of offsets) {
    await browser.scripting.executeScript({
      target: { tabId },
      func: (y: number) => window.scrollTo(0, y),
      args: [offset]
    });
    await new Promise((r) => setTimeout(r, 500));
    const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    tiles.push({ image: bitmap, y: offset });
  }

  const [{ result: dpr }] = await browser.scripting.executeScript({
    target: { tabId },
    func: () => window.devicePixelRatio
  });

  const canvas = new OffscreenCanvas(size.width * (dpr as number), size.height * (dpr as number));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('captureFullPageChromiumViaStitch: could not get 2d context');
  stitchTiles(ctx, tiles, size.width, size.height, dpr as number);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(blob);
}

/**
 * Captures the entire scrollable page, not just the viewport. Firefox uses
 * the native captureTab rect API; Chromium attaches the debugger protocol,
 * falling back to scroll-and-stitch if the debugger attach fails.
 */
export async function captureFullPage(tabId: number, windowId: number): Promise<string> {
  if (__TARGET__ === 'firefox') {
    return captureFullPageFirefox(tabId);
  }
  try {
    return await captureFullPageChromiumViaDebugger(tabId);
  } catch (err) {
    console.warn('screenshot-drop: debugger capture failed, falling back to scroll-and-stitch', err);
    return captureFullPageChromiumViaStitch(tabId, windowId);
  }
}
```

- [ ] **Step 2: Wire full-page mode into background.ts**

Modify `extension/src/ext/background.ts` — replace the `runCapture` function and its imports:

```ts
import browser from './browser';
import type { CaptureMessage } from './messaging';
import { captureStorageKey } from './messaging';
import { captureVisible } from './capture/visible';
import { captureMarked } from './capture/marked';
import { captureFullPage } from './capture/fullpage';

async function runCapture(mode: CaptureMessage['mode'], tab: { id?: number; windowId?: number }): Promise<string> {
  if (tab.windowId === undefined) throw new Error('background: active tab has no windowId');
  if (tab.id === undefined) throw new Error('background: active tab has no id');
  switch (mode) {
    case 'visible':
      return captureVisible(tab.windowId);
    case 'marked':
      return captureMarked(tab.id, tab.windowId);
    case 'full':
      return captureFullPage(tab.id, tab.windowId);
  }
}
```

The rest of `background.ts` (the `browser.runtime.onMessage.addListener(...)` block) is unchanged from Task 10.

- [ ] **Step 3: Build both targets and typecheck**

Run: `cd extension && npm run typecheck && npm run build`
Expected: no type errors (the switch over the 3-member `CaptureMode` union is exhaustive); both `dist/chromium` and `dist/firefox` rebuild with the new `background.js` containing `capture/fullpage.ts`'s code.

- [ ] **Step 4: Manual verification checklist**

1. **Firefox**: load the unpacked `dist/firefox` build, open a long scrollable page (e.g. a long Wikipedia article), click **Full page**. Confirm the annotate tab's stored capture (inspect via `about:debugging` → background page console → `await browser.storage.session.get()`) is a data URL whose decoded image height matches the page's full scroll height, not just the viewport.
2. **Brave, debugger path**: load `dist/chromium`, open the same long page, click **Full page**. Confirm Brave shows the "\<extension\> started debugging this browser" banner briefly, and the resulting stored capture covers the full page height.
3. **Brave, stitch fallback**: force the debugger path to fail by testing on a page where `chrome.debugger.attach` is disallowed (e.g. a `chrome://` internal page, or temporarily disable the `debugger` permission in `manifest.chromium.json` and rebuild). Confirm the console logs `"debugger capture failed, falling back to scroll-and-stitch"`, the page visibly scrolls through its offsets during capture, and the final stitched image has no visible seams or duplicated content at tile boundaries.
4. Confirm in both fallback and debugger paths that the final captured image's aspect ratio matches `documentElement.scrollWidth` / `scrollHeight` (no cropping or stretching).

- [ ] **Step 5: Commit**

```bash
git add extension/src/ext/capture/fullpage.ts extension/src/ext/background.ts
git commit -m "feat(extension): add full-page capture (Firefox captureTab, Chromium debugger + stitch fallback)"
```

---

## Task 12: ext annotate + options pages wiring — after Task 8, Task 9 (parallel with Task 10 / Task 11)

**Files:**
- Modify: `extension/src/ext/annotate.entry.ts`
- Modify: `extension/src/ext/options.entry.ts`
- Modify: `extension/public/annotate.html`
- Modify: `extension/public/options.html`
- Modify: `extension/src/styles/annotate.css`
- Modify: `extension/src/styles/options.css`

- [ ] **Step 1: Write the annotate page markup**

`extension/public/annotate.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="styles/annotate.css" />
  </head>
  <body>
    <div id="toolbar"></div>
    <button id="color-toggle" title="Toggle color (c)"></button>
    <button id="undo">Undo</button>
    <button id="clear">Clear</button>
    <canvas id="canvas"></canvas>
    <div id="save-bar">
      <input id="shortname" type="text" placeholder="optional short name" />
      <select id="destination"></select>
      <button id="save">Save</button>
    </div>
    <div id="toast"></div>
    <script src="annotate.entry.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the annotate styles**

`extension/src/styles/annotate.css`:

```css
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #1e1e1e;
  color: #eee;
}

#toolbar {
  display: flex;
  gap: 4px;
  padding: 8px;
}

#toolbar button,
#save-bar button,
#color-toggle {
  padding: 6px 10px;
  cursor: pointer;
}

#color-toggle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #fff;
}

canvas {
  display: block;
  max-width: 100%;
  border: 1px solid #444;
}

#save-bar {
  display: flex;
  gap: 8px;
  padding: 8px;
  align-items: center;
}

#toast {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: #333;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

#toast.visible {
  opacity: 1;
}
```

- [ ] **Step 3: Write the annotate entry point**

`extension/src/ext/annotate.entry.ts` (replaces the Task 1 stub):

```ts
import browser from './browser';
import { AnnotationEditor } from '../core/editor';
import { TOOLS, toolForKey, nextColor } from '../core/tools';
import { captureStorageKey } from './messaging';
import { HttpTransport } from '../platform/transport-http';
import { UploadError } from '../platform/transport';
import { WebextStore } from '../platform/store-webext';
import type { Destination } from '../platform/transport';

function getCaptureId(): string {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) throw new Error('annotate: missing ?id= in URL');
  return id;
}

async function loadCapture(id: string): Promise<string> {
  const key = captureStorageKey(id);
  const result = await browser.storage.session.get(key);
  const dataUrl = result[key] as string | undefined;
  if (!dataUrl) throw new Error('annotate: capture not found in session storage');
  await browser.storage.session.remove(key);
  return dataUrl;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('annotate: could not decode captured image'));
    img.src = dataUrl;
  });
}

function showToast(message: string): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 4000);
}

async function populateDestinations(select: HTMLSelectElement, store: WebextStore): Promise<void> {
  const destinations = await store.list();
  select.innerHTML = '';
  for (const dest of destinations) {
    const option = document.createElement('option');
    option.value = dest.id;
    option.textContent = dest.name;
    select.appendChild(option);
  }
  const lastUsedId = await store.getLastUsedId();
  if (lastUsedId) select.value = lastUsedId;
}

function toCanvasPoint(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

async function main(): Promise<void> {
  const id = getCaptureId();
  const dataUrl = await loadCapture(id);
  const image = await loadImage(dataUrl);

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const editor = new AnnotationEditor({ canvas, image });

  const toolbar = document.getElementById('toolbar') as HTMLElement;
  for (const tool of TOOLS) {
    const button = document.createElement('button');
    button.textContent = `${tool.label} (${tool.key})`;
    button.addEventListener('click', () => editor.setTool(tool.id));
    toolbar.appendChild(button);
  }

  const colorButton = document.getElementById('color-toggle') as HTMLButtonElement;
  colorButton.style.backgroundColor = editor.currentColor;
  colorButton.addEventListener('click', () => {
    editor.setColor(nextColor(editor.currentColor));
    colorButton.style.backgroundColor = editor.currentColor;
  });

  document.getElementById('undo')?.addEventListener('click', () => editor.undo());
  document.getElementById('clear')?.addEventListener('click', () => editor.clear());

  document.addEventListener('keydown', (e) => {
    const tool = toolForKey(e.key);
    if (tool) editor.setTool(tool);
    if (e.key === 'c') {
      editor.setColor(nextColor(editor.currentColor));
      colorButton.style.backgroundColor = editor.currentColor;
    }
  });

  canvas.addEventListener('pointerdown', (e) => editor.pointerDown(toCanvasPoint(canvas, e)));
  canvas.addEventListener('pointermove', (e) => editor.pointerMove(toCanvasPoint(canvas, e)));
  canvas.addEventListener('pointerup', () => editor.pointerUp());

  const store = new WebextStore(browser.storage.local);
  const select = document.getElementById('destination') as HTMLSelectElement;
  await populateDestinations(select, store);

  const shortnameInput = document.getElementById('shortname') as HTMLInputElement;
  const saveButton = document.getElementById('save') as HTMLButtonElement;

  saveButton.addEventListener('click', async () => {
    const destinations = await store.list();
    const dest = destinations.find((d: Destination) => d.id === select.value);
    if (!dest) {
      showToast('No destination selected — add one in Options.');
      return;
    }

    try {
      const blob = await editor.toBlob();
      const transport = new HttpTransport();
      const result = await transport.upload(dest, blob, shortnameInput.value);
      await store.setLastUsedId(dest.id);
      await navigator.clipboard.writeText(result.path);
      showToast(`Saved: ${result.path} (copied to clipboard)`);
    } catch (err) {
      if (err instanceof UploadError) {
        if (err.kind === 'auth') showToast('Auth failed — check the token in Options.');
        else if (err.kind === 'network') showToast('Could not reach the destination service.');
        else if (err.kind === 'server') showToast('Destination service returned an error.');
        else showToast('Destination service returned an unexpected response.');
      } else {
        showToast('Save failed — see console for details.');
      }
      console.error('screenshot-drop: save failed', err);
    }
  });
}

main().catch((err) => {
  console.error('screenshot-drop: annotate init failed', err);
});
```

- [ ] **Step 4: Write the options page markup**

`extension/public/options.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="styles/options.css" />
  </head>
  <body>
    <h1>Destinations</h1>
    <table>
      <thead>
        <tr><th>Name</th><th>URL</th><th>Token</th><th></th></tr>
      </thead>
      <tbody id="destinations-body"></tbody>
    </table>

    <h2>Add / Edit destination</h2>
    <form id="destination-form">
      <input type="hidden" id="form-id" />
      <label>Name <input id="form-name" type="text" /></label>
      <label>Service address <input id="form-url" type="text" placeholder="http://10.2.50.13:9922" /></label>
      <label>Token <input id="form-token" type="text" /></label>
      <p id="form-error" class="error"></p>
      <button type="submit">Save destination</button>
    </form>

    <script src="options.entry.js"></script>
  </body>
</html>
```

- [ ] **Step 5: Write the options styles**

`extension/src/styles/options.css`:

```css
body {
  font-family: system-ui, sans-serif;
  padding: 24px;
  max-width: 640px;
  margin: 0 auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 24px;
}

th,
td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid #ccc;
}

form label {
  display: block;
  margin-bottom: 8px;
}

form input {
  width: 100%;
  padding: 6px;
  box-sizing: border-box;
}

.error {
  color: #e5484d;
}
```

- [ ] **Step 6: Write the options entry point**

`extension/src/ext/options.entry.ts` (replaces the Task 1 stub):

```ts
import browser from './browser';
import { WebextStore } from '../platform/store-webext';
import type { Destination } from '../platform/transport';

function validate(name: string, url: string): string | null {
  if (name.trim() === '') return 'Name is required.';
  if (!url.startsWith('http://')) return 'Service address must start with http://';
  return null;
}

function maskToken(token: string): string {
  if (token.length <= 4) return '****';
  return `${'*'.repeat(token.length - 4)}${token.slice(-4)}`;
}

function fillForm(dest: Destination): void {
  (document.getElementById('form-id') as HTMLInputElement).value = dest.id;
  (document.getElementById('form-name') as HTMLInputElement).value = dest.name;
  (document.getElementById('form-url') as HTMLInputElement).value = dest.url;
  (document.getElementById('form-token') as HTMLInputElement).value = dest.token;
}

function clearForm(): void {
  (document.getElementById('form-id') as HTMLInputElement).value = '';
  (document.getElementById('form-name') as HTMLInputElement).value = '';
  (document.getElementById('form-url') as HTMLInputElement).value = '';
  (document.getElementById('form-token') as HTMLInputElement).value = '';
}

async function render(store: WebextStore): Promise<void> {
  const tbody = document.getElementById('destinations-body') as HTMLTableSectionElement;
  tbody.innerHTML = '';
  const destinations = await store.list();

  for (const dest of destinations) {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.textContent = dest.name;
    row.appendChild(nameCell);

    const urlCell = document.createElement('td');
    urlCell.textContent = dest.url;
    row.appendChild(urlCell);

    const tokenCell = document.createElement('td');
    tokenCell.textContent = maskToken(dest.token);
    row.appendChild(tokenCell);

    const actionsCell = document.createElement('td');
    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => fillForm(dest));
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      await store.remove(dest.id);
      await render(store);
    });
    actionsCell.append(editButton, deleteButton);
    row.appendChild(actionsCell);

    tbody.appendChild(row);
  }
}

async function main(): Promise<void> {
  const store = new WebextStore(browser.storage.local);
  await render(store);

  const form = document.getElementById('destination-form') as HTMLFormElement;
  const errorEl = document.getElementById('form-error') as HTMLElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = (document.getElementById('form-id') as HTMLInputElement).value;
    const name = (document.getElementById('form-name') as HTMLInputElement).value;
    const url = (document.getElementById('form-url') as HTMLInputElement).value;
    const token = (document.getElementById('form-token') as HTMLInputElement).value;

    const error = validate(name, url);
    if (error) {
      errorEl.textContent = error;
      return;
    }
    errorEl.textContent = '';

    const dest: Destination = { id: id || crypto.randomUUID(), name, url, token };
    await store.save(dest);
    clearForm();
    await render(store);
  });
}

main().catch((err) => {
  console.error('screenshot-drop: options init failed', err);
});
```

- [ ] **Step 7: Build both targets and typecheck**

Run: `cd extension && npm run typecheck && npm run build`
Expected: no type errors; `dist/chromium` and `dist/firefox` rebuild with populated `annotate.entry.js` and `options.entry.js`.

- [ ] **Step 8: Manual verification checklist**

1. Load the unpacked extension (either target), open the Options page (right-click the toolbar icon → Options, or via `chrome://extensions`/`about:addons`).
2. Try submitting the destination form with an empty name — confirm the inline error "Name is required." appears and nothing is saved.
3. Try submitting with a URL that doesn't start with `http://` (e.g. `https://...` or `10.2.50.13:9922`) — confirm the inline error about the service address appears.
4. Add a valid destination (name `Local Test`, URL `http://127.0.0.1:9922`, some token) — confirm it appears in the table with the token masked (only the last 4 characters visible).
5. Click **Edit** on that row, change the name, resubmit — confirm the table row updates in place (not duplicated).
6. Click **Delete** — confirm the row disappears.
7. Re-add the destination, then run a **Visible tab** capture from the popup. Confirm the annotate tab now renders the captured screenshot on a canvas (not blank).
8. On the annotate page: select each of the 4 tools via both the toolbar buttons and the `1`–`4` keys, draw one of each (arrow, rectangle, line, freehand pen) — confirm each renders immediately with a 3px stroke and round caps, and the arrow shows a visible two-stroke head.
9. Press `c` and click the color swatch — confirm the active draw color toggles between the red and blue swatch colors, and the swatch button's background updates to match.
10. Click **Undo** — confirm the most recent annotation disappears; click **Clear** — confirm all annotations disappear.
11. With the destination from step 4 selected (running an actual `snapdropd` locally with a matching token — see Task 13, Step 1, for how to start one), click **Save**. Confirm a toast appears with the returned path, and that pasting (Ctrl+V) into any text field shows that same path was copied to the clipboard.
12. Change the destination's token to something wrong in Options, retry Save — confirm the toast reads the auth-failure message.
13. Stop the local `snapdropd` process, retry Save — confirm the toast reads the network-failure message.

- [ ] **Step 9: Commit**

```bash
git add extension/src/ext/annotate.entry.ts extension/src/ext/options.entry.ts extension/public/annotate.html extension/public/options.html extension/src/styles/annotate.css extension/src/styles/options.css
git commit -m "feat(extension): wire annotate page (draw+save) and options page (destination CRUD)"
```

---

## Task 13: End-to-end verification — after all previous tasks

**Files:** none (verification only).

- [ ] **Step 1: Start a local snapdropd instance for testing**

Run:

```bash
cd service
go build -o bin/snapdropd ./cmd/snapdropd
SNAPDROP_TOKEN=$(./bin/snapdropd -gen-token)
echo "test token: $SNAPDROP_TOKEN"
mkdir -p /tmp/snapdrop-e2e
./bin/snapdropd -token="$SNAPDROP_TOKEN" -dir=/tmp/snapdrop-e2e -addr=127.0.0.1:9922 &
sleep 1
```

- [ ] **Step 2: curl matrix — healthz (no auth required)**

Run:

```bash
curl -s http://127.0.0.1:9922/healthz
```

Expected: `{"status":"ok","version":"0.1.0"}`

- [ ] **Step 3: curl matrix — happy path upload**

Run (from the repo root, reusing the icon fixture from Task 1):

```bash
curl -s -X POST http://127.0.0.1:9922/upload \
  -H "X-Snapdrop-Token: $SNAPDROP_TOKEN" \
  -H "Origin: chrome-extension://testid" \
  -F "image=@extension/public/icons/icon16.png" \
  -F "shortname=e2e-test"
```

Expected: JSON body with a `path` ending in `_e2e-test.png`, located under `/tmp/snapdrop-e2e/`. Confirm the file exists:

```bash
ls /tmp/snapdrop-e2e/*e2e-test.png
```

- [ ] **Step 4: curl matrix — wrong token (401)**

Run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:9922/upload \
  -H "X-Snapdrop-Token: wrong" \
  -H "Origin: chrome-extension://testid" \
  -F "image=@extension/public/icons/icon16.png"
```

Expected: `401`

- [ ] **Step 5: curl matrix — disallowed origin (403)**

Run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:9922/upload \
  -H "X-Snapdrop-Token: $SNAPDROP_TOKEN" \
  -H "Origin: https://evil.example.com" \
  -F "image=@extension/public/icons/icon16.png"
```

Expected: `403`

- [ ] **Step 6: curl matrix — CORS preflight**

Run:

```bash
curl -s -i -X OPTIONS http://127.0.0.1:9922/upload \
  -H "Origin: chrome-extension://testid" \
  -H "Access-Control-Request-Method: POST"
```

Expected: `204 No Content`; response headers include `Access-Control-Allow-Origin: chrome-extension://testid` (the specific origin, never `*`), `Access-Control-Allow-Headers: X-Snapdrop-Token, Content-Type`, `Access-Control-Allow-Methods: POST, OPTIONS`.

- [ ] **Step 7: curl matrix — filename collision**

Run:

```bash
curl -s -X POST http://127.0.0.1:9922/upload -H "X-Snapdrop-Token: $SNAPDROP_TOKEN" -H "Origin: chrome-extension://testid" -F "image=@extension/public/icons/icon16.png" -F "shortname=dup" > /tmp/first.json
curl -s -X POST http://127.0.0.1:9922/upload -H "X-Snapdrop-Token: $SNAPDROP_TOKEN" -H "Origin: chrome-extension://testid" -F "image=@extension/public/icons/icon16.png" -F "shortname=dup" > /tmp/second.json
cat /tmp/first.json /tmp/second.json
ls /tmp/snapdrop-e2e | grep dup
```

Expected: two distinct filenames in the directory listing, the second ending in `-2.png` immediately before the extension (e.g. `..._dup.png` and `..._dup-2.png`); the two JSON responses show two different `path` values.

- [ ] **Step 8: curl matrix — non-PNG content (400)**

Run:

```bash
echo "not a png" > /tmp/notpng.txt
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:9922/upload \
  -H "X-Snapdrop-Token: $SNAPDROP_TOKEN" -H "Origin: chrome-extension://testid" -F "image=@/tmp/notpng.txt"
```

Expected: `400`

- [ ] **Step 9: Stop the local test server**

Run:

```bash
kill %1
```

- [ ] **Step 10: Full automated test suite**

Run:

```bash
cd extension && npm test && npm run typecheck
cd ../service && go vet ./... && go test ./...
```

Expected: every extension test (core + platform, ~50 assertions across `geometry`, `annotations`, `tools`, `renderer`, `editor`, `stitch`, `transport`, `store`) and every Go test (config, token, auth, save, handler) PASS; both typecheck and vet are clean.

- [ ] **Step 11: Browser end-to-end checklist (Brave)**

1. Start a real `snapdropd` (as in Step 1), with the token noted.
2. Load the unpacked `extension/dist/chromium` build.
3. In Options, add a destination pointing at `http://127.0.0.1:9922` with that token.
4. From a real webpage, run all three capture modes (Visible tab, Full page, Marked area) in turn. For each: annotate with at least one arrow, one rectangle, and one freehand pen stroke in both colors, then Save.
5. Confirm each Save shows a toast with a real absolute path and that the path is on the clipboard (paste it somewhere to confirm).
6. Confirm each saved file actually exists at the returned path and opens as a valid PNG showing the annotations.

- [ ] **Step 12: Browser end-to-end checklist (Firefox)**

Repeat Step 11 exactly, loading `extension/dist/firefox` as a temporary add-on instead.

- [ ] **Step 13: systemd install check (Computer B, or any Ubuntu VM available for testing)**

Follow `service/deploy/install.md` end-to-end. Confirm:

```bash
sudo systemctl status snapdropd
```

shows `active (running)`, and:

```bash
curl http://127.0.0.1:9922/healthz
```

(run on that machine) returns `{"status":"ok","version":"0.1.0"}`. From a second machine on the same LAN, confirm:

```bash
curl http://<computer-b-lan-ip>:9922/healthz
```

also succeeds, proving the service is reachable over the LAN as intended.

- [ ] **Step 14: Final commit (if any fixes were needed during verification)**

If Steps 1–13 required any code fixes, stage and commit them with a message describing what verification step caught the issue, e.g.:

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```

If no fixes were needed, this step is a no-op — the project is complete.
