# @omss-server/vidsrc-provider

OMSS **`BaseProvider`** for [VidSrc](https://vsembed.ru/) — scrapes the public embed and resolves **HLS (m3u8)** stream URLs.

Ported from [cinepro-org/core VidSrcProvider](https://github.com/cinepro-org/core/blob/main/src/providers/vidsrc/vidsrc.ts).

## Flow

1. Embed: `https://vsembed.ru/embed/movie?tmdb={id}` (or `/embed/tv?...`)
2. RCP iframe (e.g. `cloudorchestranova.com` / `cloudnestra.com`)
3. `prorcp` player page → `file:` templates with `{v1}`…`{v4}` domain placeholders
4. Proxied HLS sources via `createProxyUrl`

## Config

```json
{
  "package": "@omss-server/vidsrc-provider",
  "enabled": true,
  "config": {
    "id": "vidsrc",
    "name": "VidSrc"
  }
}
```

| Env | Default |
|-----|---------|
| `VIDSRC_BASE_URL` | `https://vsembed.ru` |
| `VIDSRC_STREAM_REFERER` | (player origin from scrape) |
| `VIDSRC_TIMEOUT_MS` | `20000` |

## Notes

VidSrc may challenge Cloudflare Turnstile on the final player page (especially VPN/datacenter IPs). When that happens the provider returns a diagnostic instead of sources.

## Build

```bash
npm run build --prefix plugins/vidsrc-provider
```
