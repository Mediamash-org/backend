# Production deployment

Deploy MediaMash (OMSS server) with Docker Compose: API + stream proxy + Redis cache, behind your own TLS reverse proxy.

## What you get

| Service | Role |
|---------|------|
| `omss` | Node server (`/`, `/v1/*`, `/api/*`, `/ui`, `/admin/*`) |
| `redis` | Source / subtitle cache (`CACHE_TYPE=redis`) |

The LG webOS app lives in **[Mediamash-org/webos](https://github.com/Mediamash-org/webos)** and is pointed at your `PUBLIC_URL`. It is not baked into this image.

## Requirements

- Docker Engine 24+ and Compose v2 (`docker compose version`)
- A host with outbound HTTPS (providers + TMDB)
- A TMDB API key: [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
- A public hostname with TLS (or a tunnel) for real clients

Recommended: 1 vCPU, 1–2 GB RAM, SSD.

## Quick start

```bash
git clone https://github.com/Mediamash-org/backend.git
cd backend
cp .env.docker.example .env
# Edit .env — at minimum set:
#   TMDB_API_KEY=...
#   PUBLIC_URL=https://omss.example.com

docker compose up -d --build
docker compose ps
curl -fsS "$PUBLIC_URL/"   # or http://127.0.0.1:${PORT:-3000}/ if testing locally
```

### Use a GitHub Release image (GHCR) — recommended for production

1. Open the latest [Release](https://github.com/Mediamash-org/backend/releases).
2. Download **`mediamash-backend-<version>-compose.zip`**, unzip it.
3. `cp .env.example .env` — set `TMDB_API_KEY` and `PUBLIC_URL`.
4. Append the image pin: `cat .env.image >> .env`
5. `docker compose up -d`

Or from a clone of this repo:

```env
OMSS_IMAGE=ghcr.io/mediamash-org/backend:1.2.0
OMSS_PULL_POLICY=always
```

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

(`docker-compose.prod.yml` pulls the released image only — no local build.)

Useful checks:

```bash
# OMSS health + provider list
curl -fsS http://127.0.0.1:3000/ | jq .

# Admin provider status
curl -fsS http://127.0.0.1:3000/admin/providers | jq .

# Sample movie sources (replace id)
curl -fsS "http://127.0.0.1:3000/v1/movies/550" | jq '.sources | length'

# Logs
docker compose logs -f omss
```

Console UI (optional): `https://omss.example.com/ui`

## Critical: `PUBLIC_URL`

`PUBLIC_URL` must be the **exact origin clients use** (scheme + host + optional port, no trailing slash).

Examples:

| Clients reach you at | Set `PUBLIC_URL` to |
|----------------------|---------------------|
| `https://omss.sostk.app` | `https://omss.sostk.app` |
| Local-only test | `http://127.0.0.1:3000` |
| LAN TV on HTTP | `http://192.168.1.50:3000` |

Providers return stream URLs under `/v1/proxy?...` on that origin. If `PUBLIC_URL` does not resolve to this Compose stack, playback and (with probes enabled) source discovery fail.

Keep `INTERNAL_DEBUG=false` in production so dead streams are filtered. Probes hit the container loopback when the URL host matches `PUBLIC_URL`, so a public hostname does not need to hairpin through DNS for filtering.

## Environment reference

Copy from [`.env.docker.example`](../.env.docker.example). Compose always injects Redis settings for the `omss` service.

| Variable | Required | Notes |
|----------|----------|--------|
| `TMDB_API_KEY` | yes | Catalog + ID validation |
| `PUBLIC_URL` | yes | Public origin for proxy URLs |
| `PORT` | no | Container listen port (default `3000`). Healthchecks use this same value. |
| `OMSS_HOST_PORT` | no | Host port mapped to container `PORT` (defaults to `PORT`) |
| `CACHE_TYPE` | set by Compose | `redis` |
| `REDIS_HOST` | set by Compose | `redis` |
| `INTERNAL_DEBUG` | set by Compose | `false` |
| `OMSS_NAME` | no | Backend display name |
| `SOURCE_PROBE_TIMEOUT_MS` | no | Default `12000` |

Provider toggles live in [`config/providers.json`](../config/providers.json) (mounted read-only into the container). Edit on the host and reload:

```bash
curl -X POST http://127.0.0.1:3000/admin/providers/reload
# or
docker compose restart omss
```

## TLS reverse proxy

Do **not** terminate only on Node for public HTTPS. Put Caddy, nginx, Traefik, or Cloudflare in front and proxy to `127.0.0.1:3000` (or the Compose published port).

### Caddy

```caddyfile
omss.example.com {
        encode gzip
        reverse_proxy 127.0.0.1:3000
}
```

Set `PUBLIC_URL=https://omss.example.com`.

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name omss.example.com;

    # ssl_certificate     /etc/letsencrypt/live/omss.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/omss.example.com/privkey.pem;

    client_max_body_size 8m;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_buffering off;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

HLS proxy responses can be long-lived; keep read timeouts high and buffering off.

### Cloudflare / tunnel

Point the hostname at your origin (or a tunnel to `localhost:3000`). `PUBLIC_URL` must match the public `https://…` hostname users type, not the tunnel sidecar URL (unless that is what clients use).

## Firewall

Allow:

- `80` / `443` on the proxy (or only your tunnel)
- Optional: host `OMSS_HOST_PORT` only on localhost / private net if the proxy is local

Do **not** publish Redis (`6379`) to the internet. The Compose file keeps Redis on an internal network.

## webOS / client apps

1. Deploy the server as above.
2. Build the TV app from [Mediamash-org/webos](https://github.com/Mediamash-org/webos).
3. During onboarding / Settings → Server, set the API address to the same origin as `PUBLIC_URL` (e.g. `https://omss.example.com`).

Catalog calls use `/api/*`; streams use `/v1/*` on that base URL.

## Day-2 operations

```bash
# Rebuild after code or dependency changes
docker compose up -d --build

# Follow logs
docker compose logs -f omss redis

# Restart API only
docker compose restart omss

# Stop stack
docker compose down

# Stop and wipe Redis cache volume
docker compose down -v
```

Backup:

- `.env` (secrets)
- `config/providers.json`
- optional: Redis volume `mediamash_redis-data` if you care about warm cache

## Security checklist

- [ ] Real `TMDB_API_KEY` only in `.env` (never in git / image layers)
- [ ] `PUBLIC_URL` is HTTPS in production
- [ ] `INTERNAL_DEBUG=false`
- [ ] Redis not published publicly
- [ ] Reverse proxy sets `Host` + `X-Forwarded-*`
- [ ] Host firewall / security group locked down
- [ ] Image runs as non-root user `omss` (uid `10001`)

`/admin/*` is unauthenticated in this build — put it behind VPN, basic auth at the proxy, or restrict by IP if the host is public.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Empty `sources` arrays | `PUBLIC_URL` wrong; probes failing; provider disabled; TMDB id invalid |
| Health OK but no providers in `/` | `config/providers.json` mount / reload issue |
| Redis connection errors | `omss` started before Redis healthy — check `docker compose ps` |
| TLS works but streams 502 | Proxy buffering/timeouts; confirm `/v1/proxy` reaches the container |
| DNS errors for your domain on the server | Expected for some hosts; probes use loopback when URL matches `PUBLIC_URL` |

Enable temporary debug (not for long-lived prod):

```bash
# in .env
INTERNAL_DEBUG=true
docker compose up -d omss
```

## Architecture (Compose)

```
Internet
   │
   ▼
TLS reverse proxy (Caddy / nginx / Cloudflare)
   │
   ▼
omss :3000  ──edge──► (published port)
   │
   └──internal──► redis :6379
```

Outbound from `omss`: TMDB + provider sites (via the non-internal `edge` network).
