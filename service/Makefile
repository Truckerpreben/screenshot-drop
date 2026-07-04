.PHONY: build test

build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/snapdropd ./cmd/snapdropd

test:
	go test ./...
