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
	if resp.Version != "0.2.0" {
		t.Errorf("version field = %q, want 0.2.0", resp.Version)
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
