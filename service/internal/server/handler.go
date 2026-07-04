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
