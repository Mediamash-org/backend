# @omss-server/twoembed-provider

OMSS **`BaseProvider`** for [2Embed](https://www.2embed.online/) — resolves **HLS** streams through 2Embed's `xpass` fallback.

## How it works

Public docs use embeds like:

- Movie: `https://www.2embed.online/embed/movie/{tmdbId}`
- TV: `https://www.2embed.online/embed/tv/{tmdbId}/{season}/{episode}`

Instead of using the dead VIP `shadowx.2embed.stream` source, this plugin follows the `xpass` fallback used by 2Embed:

- Movie: `https://play.xpass.top/e/movie/{id}`
- TV: `https://play.xpass.top/e/tv/{id}/{s}/{e}`

It parses the xpass page for a playlist JSON URL, fetches that playlist, and maps the returned HLS sources plus subtitle API results into OMSS output.

## Config

```json
{
  "package": "@omss-server/twoembed-provider",
  "enabled": true,
  "config": {
    "id": "2embed",
    "name": "2Embed"
  }
}
```

| Env | Default |
|-----|---------|
| `TWOEMBED_BASE_URL` | `https://www.2embed.online` |
| `TWOEMBED_STREAM_HOST` | `https://play.xpass.top` |
| `TWOEMBED_TIMEOUT_MS` | `20000` |

## Build

```bash
npm run build --prefix plugins/twoembed-provider
```
