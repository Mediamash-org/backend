# Pikashow provider

OMSS port of the CNCVerse CloudStream [`PikashowProvider`](../../PikashowProvider).

## API

- Base: `https://manoda.co`
- Catalog: `GET /v1/api/videos?type={hollywood|bollywood|series}&channel=pikashow`
- Stream: `GET /v1/api/video?type=&videoId=&title=&noseasons=&noepisodes=` with HMAC headers

## Auth

HMAC-SHA256 over `{apiKey}:{unixSeconds}`:

| Header | Value |
| --- | --- |
| `X-API-Key` | API key |
| `X-Timestamp` | unix seconds |
| `X-Signature` | hex HMAC |

Defaults match the published CloudStream plugin binary (override via env).

| Env | Default |
| --- | --- |
| `PIKASHOW_BASE_URL` | `https://manoda.co` |
| `PIKASHOW_API_KEY` | (bundled default) |
| `PIKASHOW_HMAC_SECRET` | (bundled default) |
| `PIKASHOW_TIMEOUT_MS` | `25000` |
| `PIKASHOW_PREFERRED_LANGS` | `English,Hindi` |
