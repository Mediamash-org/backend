# Releasing

How maintainers publish versioned Docker images and GitHub Releases for **[Mediamash-org/backend](https://github.com/Mediamash-org/backend)**.

## What “a release” does

1. You run `npm run release -- <semver>` (or push a `v*` tag yourself).
2. Workflow [`.github/workflows/docker-release.yml`](../.github/workflows/docker-release.yml) runs on the tag.
3. It builds a **linux/amd64** image and pushes it to **GitHub Container Registry**:
   - `ghcr.io/mediamash-org/backend:<version>`
   - `ghcr.io/mediamash-org/backend:latest` (stable tags only; not `v1.2.0-rc.1`)
   - `ghcr.io/mediamash-org/backend:sha-<short>`
4. A **GitHub Release** is created with:
   - Pull / Compose instructions
   - **`mediamash-backend-<version>-compose.zip`** — production Compose stack (image-only, no build)
   - `.env.image` pinning `OMSS_IMAGE` to that version

> **Note:** Multi-arch `linux/arm64` via QEMU was removed from CI — emulated `npm`/`tsc` is so slow the job looks stuck. Add ARM later with a native `ubuntu-24.04-arm` runner if needed.
5. Commit log since the previous tag is included in the release notes.

CI on every PR: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## One-time org / repo setup

### 1. Create the repository under the org

1. Open [Mediamash-org](https://github.com/Mediamash-org).
2. Create repository **`backend`** (this codebase) — public or private as you prefer.
3. Push `main` (or `master`).

```bash
git remote add origin https://github.com/Mediamash-org/backend.git
git push -u origin main
```

### 2. Workflow permissions

**Settings → Actions → General:**

- Actions permissions: allow workflow + org actions as you prefer.
- **Workflow permissions:** Read and write permissions (needed for Releases + GHCR).

### 3. Make GHCR packages public (recommended)

After the first successful release:

1. GitHub profile/org → **Packages**.
2. Open `ghcr.io/mediamash-org/backend`.
3. **Package settings → Change visibility → Public**.

Until then, consumers need a PAT:

```bash
echo YOUR_GHCR_PAT | docker login ghcr.io -u USERNAME --password-stdin
docker pull ghcr.io/mediamash-org/backend:latest
```

### 4. Optional: Actions secrets

| Secret | When |
|--------|------|
| `TMDB_API_KEY` | Only if you later add live smoke jobs that call TMDB |

Default CI uses a dummy key and does not call TMDB live.

### 5. Branch protection (recommended)

On `main`: require PR + green `CI` before merge. Do not allow force-push.

## Cut a release

Working tree must be clean; you must be on `main` (or your default branch).

```bash
# preview
npm run release -- 1.2.0 --dry-run

# bump package.json, commit, tag v1.2.0, push branch + tag
npm run release -- 1.2.0
```

Pre-releases (no `latest` tag on GHCR):

```bash
npm run release -- 1.3.0-rc.1
```

Watch **Actions → Docker release**. When green, open the new **Release** on GitHub.

### Manual rebuild

**Actions → Docker release → Run workflow**

- Empty tag → builds current default branch as `:edge`
- `v1.2.0` → rebuilds that tag and refreshes the Release notes

## Consume a release

### Option A — release zip (no git clone)

Download `mediamash-backend-<version>-compose.zip` from the Release assets, then follow its `README.md`.

### Option B — clone + prod compose

`.env`:

```env
OMSS_IMAGE=ghcr.io/mediamash-org/backend:1.2.0
OMSS_PULL_POLICY=always
PUBLIC_URL=https://omss.example.com
TMDB_API_KEY=...
PORT=3000
```

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Or use the default `docker-compose.yml` (supports local `--build`) with the same `OMSS_IMAGE` override — see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Versioning

Follow [SemVer](https://semver.org/):

| Change | Example |
|--------|---------|
| Breaking API / compose defaults | `2.0.0` |
| New providers, features | `1.3.0` |
| Fixes, docs in image | `1.2.1` |

Tags must match `vX.Y.Z` or `vX.Y.Z-prerelease`.

## Checklist before tagging

- [ ] `npm run typecheck` and `npm test` pass locally
- [ ] `docs/DEPLOYMENT.md` still accurate for env vars
- [ ] `config/providers.example.json` updated if plugin list changed
- [ ] Changelog / release notes intent clear in recent commits
- [ ] No secrets in the tree
