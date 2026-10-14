# Choghadiya — developer tooling
#
# Zero-install workflow for the SITE: it is a static ESM bundle deployed verbatim
# to GitHub Pages — no build step, no bundler, no framework (docs/05-plan.md §6,
# ADR-001/ADR-002). `make dev` serves the repo root with python3's stdlib HTTP
# server; `make test` runs the Node test runner. Neither needs `npm install`.
#
# `make check` (DO-02, t_e96f9d7a; SEC-22 greps added t_899c4547) is the M7 quality
# gate: unit/contract tests + SEC-22 source greps (SEC-05/03/14) + headless-Chromium
# smoke + axe-core accessibility scan. The smoke/axe steps are the only ones that
# need dev dependencies (axe-core, pinned exact in package.json as a
# devDependency and never shipped — the deployed site keeps `script-src 'self'`).
# The greps step is pure Node, no deps. Install dev deps once with `npm ci`; the
# shipped site itself stays dependency-free.
# `make check` exit codes are CI-honest: 0 green, 1 a real failure (a red test, a
# failed grep assertion, a failed smoke assertion, or a critical/serious axe
# violation), 2 the harness could not run (no Chrome, axe-core not installed, a
# shipped file missing) — never a silent pass.
#
# ---- Cache-busting / ASSET_VERSION (US-19 AC3, research R7) -----------------
# ASSET_VERSION is the `version` field of package.json (baseline 2.1.0). It must
# appear as the `?v=` query on every asset URL in index.html (favicon, style.css,
# module script) AND on every internal `?v=` module specifier in app.js. GitHub
# Pages' shared CDN caches by full URL, so a version bump is what busts the cache
# on redeploy — there are no hashed filenames and no build step.
#
# Release bump procedure (one commit):
#   1. make bump VERSION=2.3.1      # package.json + package-lock.json + every ?v= token
#   2. make check                   # scripts/smoke.mjs asserts every ?v= == version
#   3. git commit -am "chore(release): v2.3.1" && git tag -a v2.3.1
# The version bump, the git tag and the `?v=` change ship in the SAME commit
# (docs/04-architecture.md §11.4/§11.5). The bump list MUST cover any shipped module
# that carries a `?v=` token — v2.3.0 added session-store.js and inauspicious.js to the
# graph, so the target rewrites index.html plus every root/vendor module (`$(SHIPPED_JS)`)
# rather than a hardcoded pair, and scripts/smoke.mjs (assetVersions()) fails the gate if
# a token anywhere in the transitive graph is left behind.
#
# The version lives in THREE places and `make bump` moves all three in one command:
# package.json `version`, package-lock.json root `version` AND packages."".version
# (folded in t_2f439e59 — previously the two lock fields were hand-edited every
# release and drifted). `npm version --no-git-tag-version --allow-same-version` does
# the two files cleanly and touches exactly those three fields (verified: the axe-core
# devDependency version is left untouched); --allow-same-version keeps a re-run with the
# current version a no-op instead of npm's "Version not changed" hard error.
# The `?v=` tokens are still rewritten by the perl pass (unchanged behaviour).

PYTHON ?= python3
NODE   ?= node
NPM    ?= npm
PORT   ?= 8080

# Every shipped module that may carry a `?v=` cache-busting token (kept in sync with
# scripts/smoke.mjs shippedJsFiles(): root modules + the vendored library).
SHIPPED_JS := $(wildcard *.js) $(wildcard vendor/*.js)

.PHONY: all dev test smoke axe greps check bump help

all: test

## dev: serve the repo root at http://localhost:8080 (Ctrl-C to stop)
dev:
	$(PYTHON) -m http.server $(PORT)

## test: run the Node built-in test runner over tests/ (same as `npm test`)
test:
	$(NODE) --test "tests/**/*.test.js"

## smoke: headless-Chromium smoke (Mumbai fixture rows, i18n toggle, the v2.3.0 surfaces, budgets)
smoke:
	$(NODE) scripts/smoke.mjs

## axe: axe-core accessibility gate — exits non-zero on any critical/serious violation (M7)
axe:
	$(NODE) scripts/axe-check.mjs

## greps: SEC-22 source gate — fails on any HTML sink / inline style-handler / non-allow-listed origin in shipped code
greps:
	$(NODE) scripts/security-greps.mjs

## check: the M7 quality gate — test + greps + smoke + axe (needs `npm ci` once for axe-core)
check: test
	$(NODE) scripts/security-greps.mjs
	$(NODE) scripts/smoke.mjs
	$(NODE) scripts/axe-check.mjs

## bump: set ASSET_VERSION everywhere. Usage: make bump VERSION=2.3.1
bump:
	@test -n "$(VERSION)" || { echo "usage: make bump VERSION=x.y.z"; exit 1; }
	$(NPM) version --no-git-tag-version --allow-same-version $(VERSION)
	perl -pi -e 's/\?v=[A-Za-z0-9._-]+/?v=$(VERSION)/g' index.html $(SHIPPED_JS)
	@echo "ASSET_VERSION -> $(VERSION) (package.json + package-lock.json + every ?v= in index.html and the shipped modules)"
	@echo "next: make check, then commit the bump with the annotated tag v$(VERSION)"

## help: list available targets
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //'
