package server

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
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
	mux.Handle("/ping", AuthMiddleware(token, http.HandlerFunc(PingHandler)))
	mux.HandleFunc("/healthz", HealthzHandler)
	return mux
}

// prepareDir resolves dir to an absolute path and ensures it exists as a
// usable directory, so startup fails fast rather than the first upload. This
// also pins the relative default ("./screenshots") to an absolute path at
// startup instead of resolving it against the process CWD per-request.
func prepareDir(dir string) (string, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", fmt.Errorf("server: cannot resolve save dir %q: %w", dir, err)
	}
	if err := os.MkdirAll(abs, 0755); err != nil {
		return "", fmt.Errorf("server: cannot create save dir %q: %w", abs, err)
	}
	return abs, nil
}

// NewServer wires the full middleware chain (recover -> maxbytes -> mux)
// around the routing table. It validates the save directory up front,
// returning an error if it cannot be resolved or created.
func NewServer(addr, token, dir string, maxBytes int64) (*http.Server, error) {
	absDir, err := prepareDir(dir)
	if err != nil {
		return nil, err
	}
	mux := NewMux(token, absDir)
	handler := RecoverMiddleware(MaxBytesMiddleware(maxBytes, mux))
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}, nil
}

const retentionInterval = time.Hour

// startRetention runs an initial prune sweep and then prunes hourly until ctx
// is cancelled. It is a no-op when both retention limits are disabled.
func startRetention(ctx context.Context, dir string, retainDays, retainMax int) {
	if retainDays <= 0 && retainMax <= 0 {
		return
	}
	PruneDir(dir, time.Now(), retainDays, retainMax)
	go func() {
		ticker := time.NewTicker(retentionInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				PruneDir(dir, time.Now(), retainDays, retainMax)
			}
		}
	}()
}

// Run starts srv and the retention sweeper, and blocks until SIGINT/SIGTERM,
// then shuts the server down gracefully and stops retention. dir is the save
// directory (resolved to absolute for pruning); retainDays/retainMax follow
// the PlanPrune semantics (0 = disabled).
func Run(srv *http.Server, dir string, retainDays, retainMax int) error {
	retentionCtx, cancelRetention := context.WithCancel(context.Background())
	defer cancelRetention()
	if absDir, err := filepath.Abs(dir); err == nil {
		startRetention(retentionCtx, absDir, retainDays, retainMax)
	} else {
		log.Printf("retention: cannot resolve dir %q, retention disabled: %v", dir, err)
	}

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
		cancelRetention()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(ctx)
	}
}
