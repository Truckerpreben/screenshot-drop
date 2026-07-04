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
