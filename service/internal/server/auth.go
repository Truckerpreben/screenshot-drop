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
		if token == "" || subtle.ConstantTimeCompare([]byte(reqToken), []byte(token)) != 1 {
			writeJSONError(w, http.StatusUnauthorized, "invalid or missing token")
			return
		}

		next.ServeHTTP(w, r)
	})
}
