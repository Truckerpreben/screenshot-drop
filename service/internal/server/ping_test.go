package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"snapdrop/service/internal/version"
)

func newPingRequest(method, token, origin string) *http.Request {
	req := httptest.NewRequest(method, "/ping", nil)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	if token != "" {
		req.Header.Set("X-Snapdrop-Token", token)
	}
	return req
}

func TestPingHappyPath(t *testing.T) {
	mux, _ := testMux(t)
	req := newPingRequest(http.MethodGet, "test-token", "chrome-extension://abc123")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusOK, rec.Body.String())
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
	if resp.Version != version.Version {
		t.Errorf("version field = %q, want %q", resp.Version, version.Version)
	}
}

func TestPingWrongToken(t *testing.T) {
	mux, _ := testMux(t)
	req := newPingRequest(http.MethodGet, "wrong-token", "chrome-extension://abc123")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestPingBadOrigin(t *testing.T) {
	mux, _ := testMux(t)
	req := newPingRequest(http.MethodGet, "test-token", "http://evil.example")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestPingPreflight(t *testing.T) {
	mux, _ := testMux(t)
	req := newPingRequest(http.MethodOptions, "", "chrome-extension://abc123")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "chrome-extension://abc123" {
		t.Errorf("Access-Control-Allow-Origin = %q, want echoed origin", got)
	}
}

func TestPingRejectsPost(t *testing.T) {
	mux, _ := testMux(t)
	req := newPingRequest(http.MethodPost, "test-token", "chrome-extension://abc123")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}
