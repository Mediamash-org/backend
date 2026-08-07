# OMSS webOS App

LG webOS streaming client. All catalog metadata and stream resolution come from the OMSS server — this app never talks to TMDB or providers directly.

## Setup

```bash
# from repo root — start the server (requires TMDB_API_KEY in .env)
npm run dev

# in another terminal
cp apps/webos/.env.example apps/webos/.env
npm run webos:dev
```

Open the Vite URL (default `http://localhost:5173`).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run webos:dev` | Vite dev server (desktop browser) |
| `npm run webos:build` | Production build to `apps/webos/dist` |
| `npm run webos:package` | Stage webOS package folder at `apps/webos/package` |

Configure the backend with `VITE_API_BASE_URL` or Settings in the app.

## Packaging for TV

```bash
npm run webos:package
ares-package apps/webos/package
ares-install --device <tv> com.omss.webos_1.0.0_all.ipk
```
