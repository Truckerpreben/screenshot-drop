package main

import (
	"fmt"
	"log"
	"os"

	"snapdrop/service/internal/config"
	"snapdrop/service/internal/server"
	"snapdrop/service/internal/token"
)

func main() {
	if hasGenTokenFlag(os.Args[1:]) {
		tok, err := token.GenerateToken()
		if err != nil {
			log.Fatalf("could not generate token: %v", err)
		}
		fmt.Println(tok)
		return
	}

	cfg, err := config.Load(os.Args[1:], os.Getenv)
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	srv, err := server.NewServer(cfg.Addr, cfg.Token, cfg.Dir, cfg.MaxBytes)
	if err != nil {
		log.Fatalf("server error: %v", err)
	}
	if err := server.Run(srv); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func hasGenTokenFlag(args []string) bool {
	for _, a := range args {
		if a == "-gen-token" || a == "--gen-token" {
			return true
		}
	}
	return false
}
