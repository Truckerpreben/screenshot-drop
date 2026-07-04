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

func TestAuthMiddlewareRejectsEmptyConfiguredToken(t *testing.T) {
	// Defense-in-depth: a server misconfigured with an empty token must not
	// accept requests that also send an empty/missing token.
	mw := AuthMiddleware("", okHandler())
	req := httptest.NewRequest(http.MethodPost, "/upload", nil)
	req.Header.Set("Origin", "chrome-extension://abc123")
	// Deliberately no X-Snapdrop-Token header.
	rec := httptest.NewRecorder()
	mw.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
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
