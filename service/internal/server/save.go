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
