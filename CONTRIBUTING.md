# Contributing to MediaMash / OMSS Server

Thanks for helping improve the project. This guide covers setup, provider plugins, pull requests, and how to support the org.

## Code of conduct

Be respectful. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Development setup

**Requirements:** Node.js 20.6+, npm 10+, Git. Docker optional (see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)).

```bash
git clone https://github.com/Mediamash-org/backend.git
cd backend
cp .env.example .env
# set TMDB_API_KEY=...

npm install
npm run dev
```

Useful scripts:

| Command | Purpose |
|---------|---------|
| `npm run dev` | API with watch reload |
| `npm run build` | Compile server + provider plugins |
| `npm run typecheck` | TypeScript only |
| `npm test` | Vitest suite |
| `npm run release -- x.y.z` | Tag + push a production Docker release |

Server defaults to `http://localhost:3000`. Console UI: `/ui`.

## Project layout

```text
src/                  Host (Fastify + @omss/framework glue)
  create-host.ts      Server bootstrap, playability filter hook
  plugins/            Plugin loader / manager
  providers/          Local drop-in BaseProvider modules
  proxy/              Fixed /v1/proxy (Range / HLS rewrite)
  meta/               TMDB-backed /api/* catalog for clients
plugins/              Installable provider packages (@omss-server/*)
config/providers.json Enabled plugins + options
docs/                 Spec, architecture, providers, deployment, releasing
.github/workflows/    CI + Docker GHCR release
```

Client apps live in separate repos (one per platform), e.g. https://github.com/Mediamash-org/webos

## Creating a provider

Providers are official [`BaseProvider`](https://github.com/omss-spec/framework) classes. This host does **not** invent a separate scrape API.

### Path A — local (fast iteration)

1. Add `src/providers/my-site.ts` exporting `class MySiteProvider extends BaseProvider`.
2. Ensure `config/providers.json` lists `./src/providers` under `localDirectories`.
3. Restart `npm run dev`.
4. Hit `GET /v1/movies/{tmdbId}` or use `/ui`.

### Path B — plugin package (recommended for sharing)

1. Copy [`plugins/sample-provider-plugin`](./plugins/sample-provider-plugin) → `plugins/my-provider`.
2. Implement `createOmssProviders(config)` returning `BaseProvider[]`.
3. Use `this.createProxyUrl(streamUrl, headers)` for playable URLs (CORS / referer).
4. Wire the package in root `package.json` (`file:plugins/my-provider`) and `config/providers.json`.
5. `npm install && npm run build:plugins`.

**Full contract, checklist, and testing:**  
→ [docs/PROVIDER_PLUGIN_GUIDE.md](./docs/PROVIDER_PLUGIN_GUIDE.md)  
→ [docs/PROVIDERS.md](./docs/PROVIDERS.md)

### Provider quality bar

- Resolve by **TMDB id** (movies / TV season+episode as required).
- Return OMSS-shaped `sources` (and `subtitles` when available).
- Prefer proxied URLs so TVs can play streams.
- Fail soft: empty sources + diagnostics, not thrown crashes.
- Do not commit secrets; read them from `config` / env.

## Pull requests

1. Branch from `main` (or `master`): `feat/…`, `fix/…`, `docs/…`.
2. Keep PRs focused; include a short “why”.
3. Run `npm run typecheck` and `npm test` before opening the PR.
4. For provider work, note a sample TMDB id that returns sources.
5. Do not commit `.env`, API keys, or large binary dumps.

CI (`.github/workflows/ci.yml`) runs install → typecheck → build → test on every PR.

## Releasing (maintainers)

```bash
npm run release -- 1.2.0
```

That bumps `package.json`, commits, tags `v1.2.0`, and pushes. Actions builds multi-arch images to **GHCR** and opens a GitHub Release.

Details: [docs/RELEASING.md](./docs/RELEASING.md).

## Supporting the project

You do not need to write code to help:

- **Star / watch** the org repos so releases show up in your feed.
- **File issues** with host OS, `PUBLIC_URL`, and a failing TMDB id (use the bug template).
- **Improve docs** — typos and clearer deploy steps are high value.
- **Sponsor / donate** — if the org enables GitHub Sponsors or lists other options, see [SUPPORT.md](./SUPPORT.md).
- **Share** working provider ports as PRs or linked repositories under the org.

## Security

Report vulnerabilities privately per [SECURITY.md](./SECURITY.md). Do not open public issues for exploitable proxy or auth flaws.
