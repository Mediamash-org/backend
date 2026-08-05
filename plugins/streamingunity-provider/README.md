# StreamingUnity provider

OMSS `BaseProvider` for [StreamingUnity](https://streamingunity.vip/) (StreamingCommunity-style site).

## Flow

1. `GET /{locale}/search?q={title}` → candidate internal ids  
2. `GET /{locale}/titles/{id}-{slug}` until `tmdb_id` matches  
3. TV: `GET /{locale}/titles/{id}-{slug}/season-{n}` for episode `scws_id`  
4. `GET /{locale}/iframe/{titleId}` (TV: `?episode_id=`) → VixCloud embed URL  
5. Parse `window.masterPlaylist` / `window.streams` from the embed page  
6. Proxy `https://vixcloud.co/playlist/{scwsId}?token=…&expires=…`

## Env

| Variable | Default |
|----------|---------|
| `STREAMINGUNITY_BASE_URL` | `https://streamingunity.vip` |
| `STREAMINGUNITY_LOCALE` | `en` |
| `STREAMINGUNITY_TIMEOUT_MS` | `20000` |
| `STREAMINGUNITY_MAX_SEARCH` | `8` |
