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

- `GET /` / `GET /v1` — backend info + providers  
- `GET /v1/movies/{tmdbId}` — movie sources  
- `GET /v1/tv/{id}/seasons/{s}/episodes/{e}` — episode sources  
- `POST /v1/refresh/{id}` — invalidate cached response (OMSS v1.1)

## Providers

Two install paths (both use official `BaseProvider` — see [docs/PROVIDERS.md](docs/PROVIDERS.md)):

1. **Local:** drop modules into `src/providers/`
2. **Plugin package:** `npm install your-provider` and list it under `plugins` in [`config/providers.json`](config/providers.json)

**Authoring plugins:** [docs/PROVIDER_PLUGIN_GUIDE.md](docs/PROVIDER_PLUGIN_GUIDE.md)

Sample plugin: `@omss-server/sample-provider-plugin`  
NetMirror plugin (from `NetMirror-Extension-master`): `@omss-server/netmirror-provider` — see [`plugins/netmirror-provider`](plugins/netmirror-provider)

Admin (not OMSS): `GET /admin/providers`, `POST /admin/providers/:id/enable|disable`
