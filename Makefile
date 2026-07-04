.PHONY: ext service test

ext:
	cd extension && npm run build

service:
	cd service && make build

test:
	cd extension && npm test
	cd service && make test
