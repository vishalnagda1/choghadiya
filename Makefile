# Choghadiya — developer tooling (DO-01)
#
# Zero-install workflow: the site is a static ESM bundle deployed verbatim to
# GitHub Pages — no build step, no bundler, no framework (docs/05-plan.md §6,
# ADR-001/ADR-002). `make dev` serves the repo root with python3's stdlib HTTP
# server; nothing needs `npm install` to run or test.
#
# `make check` (smoke + axe) is added later by DO-02 and is intentionally NOT
# defined here so this file stays within DO-01's scope.

PYTHON ?= python3
NODE   ?= node
PORT   ?= 8080

.PHONY: all dev test help

all: test

## dev: serve the repo root at http://localhost:8080 (Ctrl-C to stop)
dev:
	$(PYTHON) -m http.server $(PORT)

## test: run the Node built-in test runner over tests/ (same as `npm test`)
test:
	$(NODE) --test "tests/**/*.test.js"

## help: list available targets
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //'
