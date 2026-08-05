# @omss-server/peachify-provider

OMSS **`BaseProvider`** that scrapes [Peachify](https://peachify.pro/) backends for **direct stream URLs** (not just the iframe embed).

## How it works

Public embed (iframe):

- Movie: `https://peachify.top/embed/movie/{tmdbId}`
- TV: `https://peachify.top/embed/tv/{tmdbId}/{season}/{episode}`

This plugin instead calls Peachify’s JSON APIs in parallel:

| Server path | Host |
|-------------|------|
| `holly`, `air`, `multi` | `https://usa.eat-peach.sbs` |
| `moviebox`, `net` | `https://uwu.eat-peach.sbs` |

Encrypted responses (`isEncrypted: true`) are decrypted with AES-GCM (key from the peachify.top player bundle), then mapped to OMSS `sources` / `subtitles` via `createProxyUrl`.

Catalog coverage varies by title and server — empty `sources` from a healthy API means that title isn’t on that server.

## Config

```json
{
  "package": "@omss-server/peachify-provider",
  "enabled": true,
  "config": {
    "id": "peachify",
    "name": "Peachify",
    "servers": ["holly", "air", "multi", "moviebox", "net"]
  }
}
```

| Env | Default |
|-----|---------|
| `PEACHIFY_BASE_URL` | `https://peachify.top` |
| `PEACHIFY_API_URL` | `https://usa.eat-peach.sbs` |
| `PEACHIFY_MOVIEBOX_URL` | `https://uwu.eat-peach.sbs` |
| `PEACHIFY_SERVERS` | comma list of paths |
| `PEACHIFY_AES_KEY_HEX` | hex key from player (override if they rotate) |
| `PEACHIFY_TIMEOUT_MS` | `20000` |

## Build

```bash
npm run build --prefix plugins/peachify-provider
```

## Smoke

```bash
npx tsx scripts/smoke-peachify.mts
```
