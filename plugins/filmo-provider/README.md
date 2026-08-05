# Filmo provider

OMSS `BaseProvider` for [Filmo](https://filmo.to/) (movies only).

## Flow

1. `GET /search/suggest?q=` → title URL  
2. Movie page → encrypted provider chips (`data-p`)  
3. `POST /n` `{ p }` → mint token `{ x }`  
4. `GET /n/{x}` → VOE embed (mirror domains)  
5. Decode VOE `application/json` payload → HLS `source`

## Config

| Env | Default |
| --- | --- |
| `FILMO_BASE_URL` | `https://filmo.to` |
| `FILMO_TIMEOUT_MS` | `20000` |
| `FILMO_MAX_PROVIDERS` | `4` |

Movies only — Filmo has no TV catalog.
