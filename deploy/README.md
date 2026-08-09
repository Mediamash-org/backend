# Production deploy (released Docker image)

Use this folder (or the zip from a [GitHub Release](https://github.com/Mediamash-org/backend/releases)) to run MediaMash without building from source.

## Requirements

- Docker Engine 24+ / Compose v2
- TMDB API key
- A host reachable by your clients (`PUBLIC_URL`)

## Setup

```bash
cp .env.example .env
# Edit .env: set TMDB_API_KEY and PUBLIC_URL

# Pin the image from this release (file shipped next to compose):
#   OMSS_IMAGE=ghcr.io/mediamash-org/backend:x.y.z
#   OMSS_PULL_POLICY=always
cp .env.image .env.image.local   # optional; or merge into .env

# Optional provider overrides — image already has defaults. Only needed to customize:
mkdir -p config
cp providers.example.json config/providers.json
# then uncomment the volumes: providers.json mount in docker-compose.yml

# Load image pin + app env, then start
export $(grep -v '^#' .env.image | xargs)   # bash
docker compose up -d
docker compose ps
curl -fsS "http://127.0.0.1:${PORT:-3000}/"
```

If GHCR packages are private:

```bash
echo YOUR_PAT | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

## Upgrade

```bash
# After a new release, update OMSS_IMAGE in .env / .env.image
docker compose pull omss
docker compose up -d
```

Full docs: https://github.com/Mediamash-org/backend/blob/main/docs/DEPLOYMENT.md
