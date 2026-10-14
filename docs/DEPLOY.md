# Deploy Runbook — Choghadiya (GitHub Pages)

**App type:** static, no-build ESM bundle deployed **verbatim** from the repo
root. **Live URL:** <https://time.gitick.com/> (custom domain via [`CNAME`](../CNAME)).
**Host:** GitHub Pages, source = **branch `main`, path `/`**, HTTPS enforced.
**Repo:** <https://github.com/vishalnagda1/choghadiya>.

There is **no build step, no bundler, no server, no Docker**. "Packaging" a
release means: bump the asset version, run the quality gate, commit, tag, push.
GitHub Pages rebuilds automatically on every push to `main`.

---

## 0. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node | ≥ 22 (`engines.node`) | test runner + dev-only smoke/axe tooling |
| `npm ci` | once | installs the dev-only `axe-core` (never shipped) |
| `git` | any recent | commit / tag / push |
| `gh` | any recent | authenticated push + Pages inspection |

`gh` must be authenticated as an account with **`repo`** scope on
`vishalnagda1/choghadiya`:

```sh
gh auth status          # expect: Logged in to github.com account vishalnagda1, scopes include 'repo'
```

Never commit or print tokens. The git remote is plain HTTPS; credentials come
from the operator's credential helper / `gh auth setup-git` — nothing is stored
in the repo.

---

## 1. Pre-flight (must be green)

```sh
git status --short          # expect: clean working tree
git log -1 --oneline        # confirm you are about to release the intended commit
npm ci                      # once per clone (axe-core, dev-only)
make check                  # THE gate: test + greps + smoke + axe; exit 0 required
```

`make check` exit codes: `0` green, `1` a real failure, `2` the harness could
not run — never a silent pass. See the [`Makefile`](../Makefile) header.

---

## 2. Cut the release (one commit)

The version bump, the `?v=` cache-busting change and the git tag ship in the
**same** release commit (docs/04-architecture.md §11.4/§11.5).

```sh
make bump VERSION=2.2.0     # rewrites package.json + every ?v= in index.html/app.js
make check                  # smoke asserts every ?v= == package.json version
git commit -am "chore(release): v2.2.0"
git tag -a v2.2.0 -m "Choghadiya v2.2.0"
```

`ASSET_VERSION` (`package.json` `version`) must equal the tag. GitHub Pages'
shared CDN keys by full URL, so the `?v=` bump is what busts the cache on the
next deploy — there are no hashed filenames.

---

## 3. Publish

```sh
git remote add origin https://github.com/vishalnagda1/choghadiya.git   # if absent
git push origin main
git push origin v2.2.0
```

Never rewrite history and **never force-push** to `main`.

> **Unrelated-history note.** This project's workspace repository was
> initialised fresh at kickoff, so its root commit is unrelated to the legacy
> history already on GitHub `main`. Pushing was therefore done **without a
> force**: the legacy history was connected with
> `git merge --allow-unrelated-histories` (new tree wins for the paths this
> refactor owns; legacy-only files such as `LICENSE` and `assets/` are
> preserved). If you ever find the two unrelated again, resolve with a merge,
> not a force-push.

---

## 4. Verify the deploy (GitHub Pages)

```sh
# Pages build state for the pushed SHA
gh api repos/vishalnagda1/choghadiya/pages --jq '{status,html_url,build_type,source}'
gh api repos/vishalnagda1/choghadiya/pages/builds/latest --jq '{status,commit,created_at}'

# Tag visible on the remote
gh api repos/vishalnagda1/choghadiya/git/refs/tags/v2.2.0 --jq '.ref,.object.sha'
```

Then confirm the **deployed** site serves the new build (not a cached legacy
page) and run the post-deploy smoke + performance gate against the live URL:

```sh
curl -sI https://time.gitick.com/            # expect HTTP 200, https enforced
```

- **Deployed smoke (US-19 AC2 / QA KI-2):** load <https://time.gitick.com/> and
  confirm the shipped build shows the versioned assets (`?v=2.2.0` in the
  `<script>`/`<link>` tags) and the bilingual dynamic UI — not the legacy page.
- **M6 Lighthouse mobile FCP gate:** run Lighthouse (mobile preset) against the
  live URL; **FCP must be < 1.5 s**.

Record both results in the release task metadata.

---

## 5. Rollback

Static bundle, so rollback is a revert + redeploy:

```sh
git revert <release-commit>     # or `git revert v2.2.0` for the tagged commit
git push origin main
```

Bumping `?v=` (or reverting the bump) busts the Pages cache on the next deploy.
There is no database and no server state to restore.

---

## Environment variables

None are required at runtime — the app is client-only. `.env.example` documents
that there is nothing to configure:

| Variable | Required | Purpose |
|----------|----------|---------|
| `ASSET_VERSION` | build-time only | Derived from `package.json` `version`; drives the `?v=` cache-bust tokens (see `make bump`). Not read at runtime. |

Any future secret/config must go in `.env` (git-ignored) with a `.env.example`
placeholder — never in a shipped file (the deployed page keeps a strict
`script-src 'self'` CSP).
