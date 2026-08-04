# OMSS Specification Summary (Phase 1 Research)

> Research artifact for this project. **Official sources of truth** take precedence over this file:
>
> - Docs index: https://omss.mintlify.site/llms.txt
> - Site: https://omss.mintlify.site/
> - HTTP API OpenAPI (v1.1): https://raw.githubusercontent.com/omss-spec/omss-spec/refs/heads/main/spec/v1.1/omss-v1.1.yml
> - Spec prose (v1.1): https://github.com/omss-spec/omss-spec/blob/main/spec/latest/omss-v1.1.md
> - Spec repo: https://github.com/omss-spec/omss-spec

**Researched:** 2026-08-04  
**Target API version:** OMSS v1.1.0 (Final, released June 15th, 2026)

---

## 1. What is OMSS?

**OMSS (Open Media Streaming Specification / Standard)** is a unified REST API contract for media streaming backends.

Any OMSS-compliant frontend can talk to any OMSS-compliant backend through standardized:

- Endpoints
- Request/response schemas
- Source and subtitle formats
- Error codes
- Filtering and diagnostics

### Design focus (critical)

OMSS is **source-focused**, not a full media catalog platform.

**In scope (HTTP API):**

- Resolving playable/downloadable streaming sources for TMDB media IDs
- Subtitles
- Provider listing on the home endpoints
- Diagnostics for partial scrapes / provider issues
- Cache refresh by response ID

**Explicitly out of scope (HTTP API v1.1 §1.4):**

- Access control / authentication (implement yourself if needed)
- Media metadata (titles, posters, ratings, descriptions) — use the TMDB API
- Search — use the TMDB API
- Provider-specific scraping logic — implementation detail
- Video players

> Implication for this project: do **not** invent `/api/search`, catalogs, or metadata movie/series detail APIs as part of OMSS. Those are not OMSS endpoints.

---

## 2. Ecosystem layers (do not conflate)

OMSS has three related but distinct layers:

```text
┌─────────────────────────────────────────────────────────────┐
│  OMSS HTTP Specification (v1.1)                             │
│  External contract clients must speak                       │
│  OpenAPI + prose spec in omss-spec/omss-spec                │
└────────────────────────────┬────────────────────────────────┘
                             │ implemented by
┌────────────────────────────▼────────────────────────────────┐
│  Official runtimes                                          │
│  • @omss/framework — mature Fastify host for OMSS v1.x      │
│  • @omss/core — beta plugin runtime (future path for v1.1+) │
│  • omss-spec/template — starter using @omss/framework       │
└────────────────────────────┬────────────────────────────────┘
                             │ registers
┌────────────────────────────▼────────────────────────────────┐
│  Providers (scrapers / source resolvers)                    │
│  Produce sources + subtitles for a media ID                 │
└─────────────────────────────────────────────────────────────┘
```

Also related:

| Package / repo | Role |
|----------------|------|
| [`@omss/sdk`](https://github.com/omss-spec/sdk) | Frontend TypeScript SDK for calling any OMSS backend |
| [`@omss/framework`](https://github.com/omss-spec/framework) | Official Node backend framework (Fastify, provider registry, proxy, cache) |
| [`@omss/core`](https://github.com/omss-spec/core) | Newer minimal plugin orchestrator (beta); HTTP/cache/auth plugins WIP |
| [`omss-spec/template`](https://github.com/omss-spec/template) | Production-ready starter: auto-discover providers in `providers/` |

### Migration note (official)

`@omss/framework` README states it is being rewritten; **OMSS v1** can still use the framework. **Starting OMSS v1.1+**, work is moving to [`@omss/core`](https://github.com/omss-spec/core). Core is currently **beta** (`0.0.2-beta.x`); official HTTP/cache/auth plugins are listed as WIP. The OpenAPI file still links framework + template as the practical starting point.

**Phase 2 must pick a host strategy** consistent with “use existing OMSS providers without rewriting them”:

- Providers written today for the template/framework extend `@omss/framework`’s `BaseProvider`.
- Core’s `BaseProvider` API is different (OMSS IDs, resolvers, `getSources` + emitter).

---

## 3. What is an OMSS provider?

### In the HTTP specification

A **provider** is an implementation that resolves media sources from a particular upstream.

The HTTP spec:

- Defines how providers appear on `GET /` and `GET /v1` (`id`, `name`, `capabilities`)
- Allows clients to filter by `?provider={id}`
- Does **not** prescribe how providers are packaged, discovered, loaded, or configured

Quoted intent from the v1.1 reference intro: different implementations may use different architectures/languages as long as the external API matches.

### In `@omss/framework` (current practical host)

A provider is a TypeScript class extending `BaseProvider` with:

| Member | Purpose |
|--------|---------|
| `id`, `name`, `enabled` | Identity + enable flag |
| `BASE_URL`, `HEADERS` | Upstream defaults |
| `capabilities.supportedContentTypes` | e.g. `movies`, `tv` (framework also uses `sub`) |
| `getMovieSources(media)` | Movie scrape → `ProviderResult` |
| `getTVSources(media)` | TV scrape → `ProviderResult` |
| `healthCheck()` | Optional availability check |
| `createProxyUrl(...)` | Helper for proxied URLs |

### In `@omss/core` (future host)

A provider implements `OMSSProvider` / extends Core `BaseProvider`:

- `supportsId(parsedOmssId)`
- Declares required `resolver`(s)
- `getSources(media, resultEmitter)` (streaming/emitter style)
- Optional `catalog`

Core terminology ([TERMINOLOGY.md](https://github.com/omss-spec/core/blob/main/TERMINOLOGY.md)): a **Provider** is “a file in a consumer repository that receives resolver data and returns streaming sources.”

---

## 4. How are providers packaged?

| Layer | Packaging |
|-------|-----------|
| HTTP spec | Not defined |
| Framework / Template | TypeScript modules (`.ts` / `.js`) exporting a class that extends `BaseProvider` |
| Core | TypeScript modules registered into `OMSSServer` (plugin/provider registration APIs); ecosystem registry planned |

There is **no** separate binary provider package format, remote provider protocol, or manifest schema in the HTTP specification itself.

Official example providers live in:

- Template: `src/providers/my-provider.ts`, `my-second-provider.ts`
- Framework examples / docs (provider creation guide)

Community provider ecosystem for Core lists placeholders only (“no official/community plugins/resolvers yet” aside from test stubs).

---

## 5. How are providers loaded / discovered?

### Framework / Template (official documented mechanism)

1. Create `OMSSServer` from `@omss/framework`
2. `server.getRegistry()` → `ProviderRegistry`
3. Either:
   - `registry.register(new MyProvider())`, or
   - `await registry.discoverProviders('./src/providers')` (recursive directory scan)

**Auto-discovery rules** (`ProviderRegistry.discoverProviders`):

- Recurse directories
- Load `.ts` / `.js` (skip tests, `.d.ts`)
- Dynamically `import()` each file
- Instantiate any exported class whose prototype chain extends `BaseProvider`
- Register by unique `id`

Template uses:

```ts
await registry.discoverProviders(
  process.env.NODE_ENV === "production" ? "./dist/providers" : "./src/providers"
);
```

### Core

Registration goes through `OMSSServer` / plugins (`server.plugins.register(...)`). Provider discovery docs for Core are incomplete (register-a-plugin page is a stub; plugins WIP).

---

## 6. How are providers configured?

| Concern | Spec / official approach |
|---------|--------------------------|
| HTTP auth for OMSS API | Out of scope of the spec |
| TMDB API key | Required by framework/template for validation (`TMDB_API_KEY`) |
| Provider credentials | Provider-local (env vars / code); not an OMSS HTTP concept |
| Cache | Implementation detail; framework supports memory or Redis |
| Proxy / CORS / public URL | Implementation; framework provides helpers and config |

Template `.env` includes: `TMDB_API_KEY`, `PORT`, `HOST`, `PUBLIC_URL`, `CACHE_TYPE`, Redis settings, optional Stremio flags.

**Do not hardcode provider secrets into core server code** — keep them env/provider-local as the template does.

---

## 7. How does the client communicate with the server?

- **Transport:** HTTP(S) REST
- **Content type:** `application/json; charset=utf-8`
- **Accept:** JSON only (`application/json` or `*/*`); other Accept → `406 NOT_ACCEPTABLE`
- **CORS:** backends MUST handle OPTIONS preflight
- **Versioning:** URL prefix `/v1/` (semantic versioning of the API)
- **Media identity (HTTP API):** TMDB numeric IDs in path parameters
- **Optional client SDK:** `@omss/sdk`

Optional framework extras (not part of the core HTTP contract unless you enable them): MCP endpoint (`/mcp`), Stremio addon mapping.

---

## 8. What APIs exist? (OMSS v1.1)

Canonical OpenAPI path list:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Root backend info (`HomeResponse`) |
| `GET` | `/v1` | Versioned backend info (same schema) |
| `GET` | `/v1/movies/{id}` | Movie sources by TMDB ID |
| `GET` | `/v1/tv/{id}/seasons/{s}/episodes/{e}` | TV episode sources |
| `POST` | `/v1/refresh/{id}` | Invalidate cached response by UUID/id |

### Sunset notices (v1.1)

Movie, TV, and refresh endpoints are **sunset** in v1.1 and will be removed in the next major version. Backends implementing v1.x **MUST continue to support them** for the lifetime of v1.

Proxy is **no longer dictated** by the spec (v1.1 §4.4). Backends may implement proxying as they wish; `platform=web` still requires browser-usable URLs (often via a proxy in practice). Framework still exposes `/v1/proxy`.

### Query parameters (movie / TV)

| Param | Meaning |
|-------|---------|
| `platform` | `web` (default) or `native` — changes URL/header shape |
| `provider` | Restrict to one provider ID; unknown → `PROVIDER_NOT_FOUND` |
| `filter` | Filter expression on **sources** only (not subtitles) |

### Filter expression (v1.1)

- Form: `condition[;condition...]` (`;` = AND)
- Operators: `==`, `!=`, `=in=`, `=out=`
- Wildcard `*` allowed in values
- Backends MUST support filtering on: `quality`, `type`, `streamable`, `provider.id`, `provider.name`, `audioTracks`, `format`

### What project.md listed that is **not** an OMSS HTTP API

These topics appear in docs navigation / Core concepts but are **not** separate OMSS REST resources in v1.1:

- Search, catalogs, rich metadata APIs
- Dedicated “series / seasons / episodes metadata” endpoints (only episode **sources**)
- Streams as a separate resource type (sources are the stream objects)
- Spec-mandated authentication endpoints

---

## 9. What models exist?

From OpenAPI `omss-v1.1.yml` (prefer this over older Mintlify playground snippets that still show v1.0 field names like `responseId`).

### `HomeResponse`

Required: `name`, `version`, `status`, `endpoints`, `spec`, `media`, `providers`

- `spec` MUST be `"omss"`
- `status`: `operational` | `degraded` | `down`
- `endpoints.movie` / `endpoints.tv` with `{id}`, `{s}`, `{e}` placeholders
- `media.movies`: integer[] or `"*"`
- `media.tv`: `TvAvailability[]` or `"*"`
- `providers[]`: `{ id, name, capabilities[] }` where capabilities ∈ `movies` | `tv` | `subtitles`

### `SourcesResponse`

Required: `id` (UUID), `sources`, `subtitles`, `diagnostics`  
Optional: `expiresAt` (ISO 8601)

### `Source`

Required: `id`, `url`, `streamable`, `type`, `quality`, `audioTracks`, `provider`

- `type`: `hls` | `mp4` | `mkv` | `dash`
- `quality`: `8K` | `4K` | `QHD` | `FHD` | `HD` | `SD` | `Auto`
- `audioTracks`: string[] (human-readable language names; `"Original"` if unknown)
- `headers`: only for `platform=native`
- `provider`: `{ id, name }`

### `Subtitle`

Required: `id`, `url`, `label`, `format`, `provider`  
`format`: `vtt` | `srt`

### `Diagnostic`

Required: `code`, `message`, `source`, `severity`  
`code`: `PROVIDER_ERROR` | `PARTIAL_SCRAPE`  
`severity`: `warning` | `error`

### `ErrorResponse`

Required: `error` (`code`, `message`, optional `details`), `traceId`

### Error codes (OpenAPI)

`INVALID_TMDB_ID`, `INVALID_PARAMETER`, `MISSING_PARAMETER`, `INVALID_SEASON`, `INVALID_EPISODE`, `INVALID_RESPONSE_ID`, `PROVIDER_NOT_FOUND`, `RESPONSE_ID_NOT_FOUND`, `NO_SOURCES_AVAILABLE`, `ENDPOINT_NOT_FOUND`, `METHOD_NOT_ALLOWED`, `INTERNAL_ERROR`, `UNSUPPORTED_MEDIA_TYPE`, `NOT_ACCEPTABLE`

### Platform behavior

| Platform | `url` | `headers` |
|----------|-------|-----------|
| `web` (default) | Proxied / browser-ready (no CORS pain) | absent |
| `native` | Upstream provider URL | present with required request headers |

---

## 10. What capabilities exist?

### HTTP-level (provider listing)

`capabilities` on home `providers[]`: any combination of `movies`, `tv`, `subtitles`.

### Framework-level

`ProviderCapabilities.supportedContentTypes` typically includes `movies` / `tv` (and framework code references `sub`).

### Core-level

Capability model differs: ID support via `supportsId`, resolver requirements, optional catalog — not the same as HTTP capability enums.

---

## 11. How does source resolution work?

### HTTP / client view

```text
Client  →  GET /v1/movies/{tmdbId}?platform=web&provider=&filter=
Backend →  (implementation-defined scrape / aggregate)
Client  ←  SourcesResponse { id, expiresAt?, sources, subtitles, diagnostics }
```

Provider execution is **out of scope** of the HTTP sequence diagram (“Request providers — out of scope”).

### Framework / Core view (host pipeline)

**Framework:** server validates TMDB ID → selects enabled providers (optionally one `provider` query) → calls `getMovieSources` / `getTVSources` → aggregates sources/subtitles/diagnostics → applies filters → caches → returns OMSS JSON. Partial provider failures become diagnostics / empty sources rather than always failing the whole request.

**Core (documented architecture):**

1. Consumer creates `OMSSServer`, registers providers/resolvers/plugins
2. `getSources(OMSSId)` → `SourceService` → `SourceCore`
3. Eligible providers selected for the ID
4. Resolvers turn OMSS ID into metadata providers need
5. Each provider executes; results aggregated

### OMSS IDs (Core; not the current HTTP path params)

HTTP v1.1 still uses raw TMDB path IDs. Core uses namespaced IDs:

- Format: `namespace:value1:value2:...` (URI-encode `:` and spaces)
- Reserved TMDB: `tmdb:<movie_id>`, `tmdb:<show_id>:<season>:<episode>`
- Reserved IMDb: `imdb:tt#######`

---

## 12. Authentication, configuration, errors, lifecycle

### Authentication

- **Not part of the OMSS HTTP contract.** Optional plugins/framework features may add auth later (`@omss/plugin-auth` planned for Core).

### Configuration

- Spec: content negotiation, CORS OPTIONS, caching headers recommended in prose
- Host: env-based (`TMDB_API_KEY`, cache, host/port, `PUBLIC_URL`)

### Errors

- HTTP status primary; body `ErrorResponse` secondary
- Diagnostics are **non-fatal** and live in successful `200` responses when scraping partially fails

### Provider lifecycle (framework)

- Register / discover at startup
- `enabled` flag filters execution
- `unregister` / `clear` available on registry
- `healthCheck` / `healthCheckAll`
- No formal remote hot-install protocol in the HTTP spec

### Admin API

- OMSS does **not** define an admin surface
- Framework has in-process registry APIs (list, enable via provider flag, health)
- A separate admin HTTP API would be server-specific (allowed by project brief if kept off OMSS routes)

---

## 13. Docs map (what was read)

| Area | Primary URLs |
|------|----------------|
| Index | https://omss.mintlify.site/llms.txt |
| Spec intro / overview | `/spec/explanation/introduction`, `/spec/explanation/overview` |
| v1.1 reference | `/spec/latest/ref/introduction`, endpoints under `/spec/latest/ref/...` |
| Full prose spec | `/spec/latest/ref/spec.md` + GitHub `omss-v1.1.md` |
| OpenAPI | GitHub `spec/v1.1/omss-v1.1.yml` |
| Core intro / architecture / IDs | `/core/explanation/...` |
| Plugins / resolvers / namespaces | `/core/explanation/ecosystem/...` |
| Framework / template / core / sdk | GitHub `omss-spec/*` |

Sections named in the project brief that map to **out-of-scope or non-endpoint concepts** (search, catalogs, metadata, auth-as-API) were checked against the official “Out of Scope” list and overview — they are client/TMDB concerns, not OMSS routes.

---

## 14. Answers to Phase 1 “Identify” checklist

| Question | Answer |
|----------|--------|
| What is OMSS? | Open HTTP API standard for streaming **sources** (+ subtitles) keyed by TMDB IDs |
| What is an OMSS provider? | Upstream source resolver; listed on home; HTTP spec does not define packaging |
| How packaged? | Today: TS classes extending framework `BaseProvider` in consumer repos |
| How loaded? | Framework `ProviderRegistry.register` / `discoverProviders`; Core via `OMSSServer` registration |
| How configured? | Env + provider-local config; TMDB key for framework validation |
| Client ↔ server? | REST JSON over HTTP; optional `@omss/sdk` |
| What APIs? | `/`, `/v1`, movie sources, TV episode sources, refresh |
| What models? | HomeResponse, SourcesResponse, Source, Subtitle, Diagnostic, ErrorResponse, Provider |
| What capabilities? | `movies` / `tv` / `subtitles` on provider listings |
| Source resolution? | Host aggregates providers → OMSS SourcesResponse; scrape logic is implementation-defined |

---

## 15. Implications for this repository (input to Phase 2)

1. **Implement the official OMSS v1.1 HTTP API** — do not invent parallel movie/search/catalog APIs.
2. **Do not invent a new provider interface** if we host framework-compatible providers — use `@omss/framework`’s `BaseProvider` + `ProviderRegistry`, or wait for Core’s provider API if targeting the migration.
3. **Existing providers** that follow the template pattern drop into a `providers/` directory and auto-discover — that is the official install mechanism today.
4. **Preferred stack in project.md (Node, TS, Fastify, Vitest)** aligns with `@omss/framework` (Fastify) and `@omss/core` (plans Fastify HTTP plugin).
5. **Golden rule check:** building a custom scraper adapter layer around non-OMSS providers would violate the brief; hosting via the official framework/core is the compliant path.
6. **Open Phase 2 decision:** ship on `@omss/framework` + template patterns (compatible with existing providers now) vs build on `@omss/core` beta (future, incomplete HTTP plugins, different provider API).

---

## 16. Source links (quick)

- https://omss.mintlify.site/
- https://omss.mintlify.site/llms.txt
- https://github.com/omss-spec/omss-spec
- https://github.com/omss-spec/framework
- https://github.com/omss-spec/core
- https://github.com/omss-spec/template
- https://github.com/omss-spec/sdk
- https://www.npmjs.com/package/@omss/framework
- https://www.npmjs.com/package/@omss/core
