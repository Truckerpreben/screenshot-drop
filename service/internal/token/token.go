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
