# MediaMash — OMSS Server

Self-hosted [OMSS](https://github.com/omss-spec)-compatible streaming backend for **MediaMash** (catalog API, multi-provider sources, HLS/proxy, optional LG webOS client).

Built on [`@omss/framework`](https://github.com/omss-spec/framework).

**Org:** [Mediamash-org](https://github.com/Mediamash-org) · **Repo:** [Mediamash-org/backend](https://github.com/Mediamash-org/backend)

[![CI](https://github.com/Mediamash-org/backend/actions/workflows/ci.yml/badge.svg)](https://github.com/Mediamash-org/backend/actions/workflows/ci.yml)
[![Docker release](https://github.com/Mediamash-org/backend/actions/workflows/docker-release.yml/badge.svg)](https://github.com/Mediamash-org/backend/actions/workflows/docker-release.yml)

## Features

- OMSS `GET /v1/movies/{id}` · `GET /v1/tv/.../episodes/{e}` · `POST /v1/refresh/{id}` · `/v1/proxy`
- Pluggable providers (`BaseProvider` + npm plugins under `plugins/`)
- TMDB-backed `/api/*` catalog for the TV/web clients
- Production Docker Compose (Redis cache, configurable `PORT`, healthchecks)
- Automated multi-arch images on GHCR via git tags

## Quick start (dev)

```bash
cp .env.example .env          # set TMDB_API_KEY
npm install
npm run dev
```

Open `http://localhost:3000/` (health) and `http://localhost:3000/ui` (console).

## Production

```bash
cp .env.docker.example .env   # TMDB_API_KEY + PUBLIC_URL=https://your.domain
docker compose up -d --build
```

Or pull a released image after the first GitHub Release:

```env
OMSS_IMAGE=ghcr.io/mediamash-org/backend:1.2.0
OMSS_PULL_POLICY=always
```

**Full guide:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)  
**Cut a release:** [docs/RELEASING.md](docs/RELEASING.md) · `npm run release -- 1.2.0`

## Documentation

| Doc | Topic |
|-----|--------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, PRs, provider overview |
| [docs/PROVIDER_PLUGIN_GUIDE.md](docs/PROVIDER_PLUGIN_GUIDE.md) | Write a provider plugin |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Install / enable / admin |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Host design |
| [docs/OMSS_SPEC.md](docs/OMSS_SPEC.md) | Protocol summary |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Docker, TLS, `PUBLIC_URL` |
| [docs/RELEASING.md](docs/RELEASING.md) | Org setup, GHCR, tags |
| [SUPPORT.md](SUPPORT.md) | Help & sponsorship |
| [SECURITY.md](SECURITY.md) | Vulnerability reports |

## Providers

Enable/disable in [`config/providers.json`](config/providers.json). Bundled packages include NetMirror, 2Embed, Bingr, Filmo, Pikashow, VaultPlayer, VidCore, Videasy, and more under `plugins/`.

**Author a new one:** start from [`plugins/sample-provider-plugin`](plugins/sample-provider-plugin) and follow the [plugin guide](docs/PROVIDER_PLUGIN_GUIDE.md).

## webOS client

```bash
npm run webos:dev
```

Point Settings → Server at your `PUBLIC_URL`. Packaging notes: [`apps/webos/README.md`](apps/webos/README.md).

## Support the project

Stars, clear bug reports, docs PRs, and new providers all help. Sponsorship options (once enabled on the org) are listed in [SUPPORT.md](SUPPORT.md).

## License

[MIT](./LICENSE)
