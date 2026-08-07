# OMSS Server

OMSS-compliant streaming backend host built on the official [`@omss/framework`](https://github.com/omss-spec/framework).

See [docs/OMSS_SPEC.md](docs/OMSS_SPEC.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

```bash
cp .env.example .env
# set TMDB_API_KEY in .env

npm install
npm run dev
```

Server: `http://localhost:3000`

## Production (Docker)

```bash
cp .env.docker.example .env   # set TMDB_API_KEY + PUBLIC_URL
docker compose up -d --build
```

Full TLS, Redis, reverse-proxy, and ops guide: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

- **Console UI:** [`http://localhost:3000/ui`](http://localhost:3000/ui) — manage providers + test playback  
- `GET /` / `GET /v1` — backend info + providers  
- `GET /v1/movies/{tmdbId}` — movie sources  
- `GET /v1/tv/{id}/seasons/{s}/episodes/{e}` — episode sources  
- `POST /v1/refresh/{id}` — invalidate cached response (OMSS v1.1)

## Providers

Two install paths (both use official `BaseProvider` — see [docs/PROVIDERS.md](docs/PROVIDERS.md)):

1. **Local:** drop modules into `src/providers/`
2. **Plugin package:** `npm install your-provider` and list it under `plugins` in [`config/providers.json`](config/providers.json)

**Authoring plugins:** [docs/PROVIDER_PLUGIN_GUIDE.md](docs/PROVIDER_PLUGIN_GUIDE.md)

Enabled (see [`config/providers.json`](config/providers.json)):

- NetMirror — `@omss-server/netmirror-provider`
- 2Embed — `@omss-server/twoembed-provider` ([2embed.online](https://www.2embed.online/))
- Bingr — `@omss-server/bingr-provider` ([bingr.one](https://bingr.one/home))
- Filmo — `@omss-server/filmo-provider` ([filmo.to](https://filmo.to/), movies only)
- Pikashow — `@omss-server/pikashow-provider` ([manoda.co](https://manoda.co/))

Disabled after smoke testing (unreachable / dead streams): Peachify, VidSrc, StreamingUnity. Packages remain under `plugins/` if you want to re-enable.

Admin (not OMSS): `GET /admin/providers`, `POST /admin/providers/:id/enable|disable`, `POST /admin/providers/reload`  
Sample console: [`public/`](public/) served at `/ui`
