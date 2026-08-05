# Bingr provider

OMSS `BaseProvider` for [Bingr](https://bingr.one/home) via `https://api.bingr.one/api`.

## Flow

1. Optional `GET /details/{movie|tv}/{tmdbId}` for title/year when missing
2. Parallel `POST /stream` for each configured server (`srv`)
3. Map `sources[]` / `subtitles[]` through `createProxyUrl` (with upstream Referer when present)
4. Optional extra subs from `GET /subtitles/vdrk/{type}/{tmdbId}`

## Servers

| ID | Name |
|----|------|
| s11 | Sirius |
| s40 | DarkMatter |
| s12 | Quasar |
| s30 | Apollo |
| s1 | Miller |
| s2 | Mann |
| s3 | Edmunds |
| s4 | Luna |
| s5 | Aditya |

Default config prefers servers that returned streams in smoke tests: `s11,s30,s3,s4`.

## Env

| Variable | Default |
|----------|---------|
| `BINGR_SITE_URL` | `https://bingr.one` |
| `BINGR_API_URL` | `https://api.bingr.one/api` |
| `BINGR_SERVERS` | `s11,s30,s3,s4` |
| `BINGR_TIMEOUT_MS` | `20000` |
| `BINGR_FETCH_VDRK_SUBS` | `true` |
