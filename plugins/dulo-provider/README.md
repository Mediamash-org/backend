# Dulo provider

OMSS `BaseProvider` for [Dulo](https://dulo.cx/) (also [dulo.gd](https://dulo.gd/)).

## Flow

1. `GET /api/session` → `__Host-amri_session` cookie  
2. `POST /api/source` with `{ type, tmdbId, season?, episode? }` (`Accept: text/event-stream`)  
3. Parse SSE `sources` / `error` events (JSON fallback if not SSE)  
4. Map stream URLs through `createProxyUrl` (Referer = site origin)

## Config (`providers.json`)

```json
{
  "package": "@omss-server/dulo-provider",
  "enabled": true,
  "config": {
    "id": "dulo",
    "name": "Dulo",
    "maxStreams": 4
  }
}
```

## Env

| Variable | Default |
|----------|---------|
| `DULO_BASE_URL` | `https://dulo.cx` |
| `DULO_MAX_STREAMS` | `4` |
| `DULO_TIMEOUT_MS` | `35000` |

## Build

```bash
npm run build --prefix plugins/dulo-provider
```
