.PHONY: build test release

build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/snapdropd ./cmd/snapdropd

test:
	go test ./...

release:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/snapdropd-linux-amd64 ./cmd/snapdropd
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o bin/snapdropd-linux-arm64 ./cmd/snapdropd
