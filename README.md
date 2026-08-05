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

Sample plugin: `@omss-server/sample-provider-plugin`  
NetMirror: `@omss-server/netmirror-provider`  
Peachify: `@omss-server/peachify-provider` — see [`plugins/peachify-provider`](plugins/peachify-provider)  
VidSrc: `@omss-server/vidsrc-provider` — see [`plugins/vidsrc-provider`](plugins/vidsrc-provider) ([cinepro port](https://github.com/cinepro-org/core/blob/main/src/providers/vidsrc/vidsrc.ts))  
2Embed: `@omss-server/twoembed-provider` — see [`plugins/twoembed-provider`](plugins/twoembed-provider) ([2embed.online](https://www.2embed.online/))  
Bingr: `@omss-server/bingr-provider` — see [`plugins/bingr-provider`](plugins/bingr-provider) ([bingr.one](https://bingr.one/home))  
StreamingUnity: `@omss-server/streamingunity-provider` — see [`plugins/streamingunity-provider`](plugins/streamingunity-provider) ([streamingunity.vip](https://streamingunity.vip/))  
Filmo: `@omss-server/filmo-provider` — see [`plugins/filmo-provider`](plugins/filmo-provider) ([filmo.to](https://filmo.to/), movies only via VOE)

Admin (not OMSS): `GET /admin/providers`, `POST /admin/providers/:id/enable|disable`, `POST /admin/providers/reload`  
Sample console: [`public/`](public/) served at `/ui`
