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
