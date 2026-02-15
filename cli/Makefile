VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS := -ldflags "-s -w -X main.version=$(VERSION)"

build:
	CGO_ENABLED=0 go build $(LDFLAGS) -o bin/phpless ./cmd/phpless/

build-all:
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build $(LDFLAGS) -o bin/phpless-darwin-arm64 ./cmd/phpless/
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build $(LDFLAGS) -o bin/phpless-darwin-amd64 ./cmd/phpless/
	GOOS=linux  GOARCH=amd64 CGO_ENABLED=0 go build $(LDFLAGS) -o bin/phpless-linux-amd64  ./cmd/phpless/

install: build
	cp bin/phpless /usr/local/bin/phpless

clean:
	rm -rf bin/

.PHONY: build build-all install clean
