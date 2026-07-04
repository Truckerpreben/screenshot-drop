.PHONY: build test

build:
	CGO_ENABLED=0 go build -o bin/snapdropd ./cmd/snapdropd

test:
	go test ./...
