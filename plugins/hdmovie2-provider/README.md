# HDMovie2 provider

OMSS `BaseProvider` for [HDMovie2](https://newhdmovie2.beer/) — Hindi / Bollywood / Hindi-dubbed catalog.

## Flow

1. `GET /?s={title}` → pick best `/movie/...` hit (title/year + Hindi preference)  
2. Parse `data-source-embed` / `data-first-embed` iframes (`hdm2.ink/play?v=…`)  
3. TV: prefer embed labels matching `EP{episode}` on season-pack pages  
4. Fetch play page → `data-stream-url` JWT playlist → proxy HLS (+ VTT tracks when present)

## Config (`providers.json`)

```json
{
  "package": "@omss-server/hdmovie2-provider",
  "enabled": true,
  "config": {
    "id": "hdmovie2",
    "name": "HDMovie2",
    "maxStreams": 3,
    "preferHindi": true
  }
}
```

## Env

| Variable | Default |
|----------|---------|
| `HDMOVIE2_BASE_URL` | `https://newhdmovie2.beer` |
| `HDMOVIE2_MAX_STREAMS` | `3` |
| `HDMOVIE2_TIMEOUT_MS` | `25000` |
| `HDMOVIE2_PREFER_HINDI` | `true` |

## Build

```bash
npm run build --prefix plugins/hdmovie2-provider
```
