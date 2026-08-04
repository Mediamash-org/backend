# Provider Plugin Implementation Guide

How to **implement** an OMSS provider plugin for this host.

This is not a second provider API. Plugins wrap the official [`@omss/framework`](https://github.com/omss-spec/framework) **`BaseProvider`** so they can be installed as npm packages (or path modules) and configured by the host.

Related:

- Install / enable / admin overview → [PROVIDERS.md](./PROVIDERS.md)
- Spec summary → [OMSS_SPEC.md](./OMSS_SPEC.md)
- Host architecture → [ARCHITECTURE.md](./ARCHITECTURE.md)
- Reference implementation → [`plugins/sample-provider-plugin`](../plugins/sample-provider-plugin)
- Real-world port → [`plugins/netmirror-provider`](../plugins/netmirror-provider) (from NetMirror Cloudstream extension)

---

## 1. What a plugin is

| Concept | Meaning |
|---------|---------|
| **Provider** | A class that `extends BaseProvider` and returns sources/subtitles |
| **Plugin** | A Node module that *exports* one or more such providers (optionally with config) |

The host loads plugins via [`src/plugins/loader.ts`](../src/plugins/loader.ts). It does **not** call a custom scrape interface — only official `BaseProvider` methods.

```text
your-npm-package
    createOmssProviders(config)  →  BaseProvider[]
              ↓
    ProviderRegistry.register(...)
              ↓
    GET /v1/movies/{tmdbId}  (OMSS)
```

---

## 2. Plugin contract (exports)

The host accepts **either** of these entry styles. Prefer the factory.

### Preferred: `createOmssProviders`

```ts
import type { BaseProvider } from '@omss/framework'

/**
 * Called by the host with the `config` object from config/providers.json.
 * May be sync or async. Must return BaseProvider instances only.
 */
export function createOmssProviders(
  config: Record<string, unknown> = {},
): BaseProvider[] | Promise<BaseProvider[]>
```

Rules:

- If `createOmssProviders` exists, the host uses **only** that (class exports are ignored).
- Return one or more providers (a package may ship several sources).
- Apply `config` in the constructor (ids, API keys, base URLs, feature flags).
- Never return plain objects that do not extend `BaseProvider`.

### Fallback: class exports

```ts
export class MySiteProvider extends BaseProvider {
  // constructable with `new MySiteProvider()` — no required constructor args
}
```

The host instantiates every exported class whose prototype chain extends `BaseProvider` (including `default` export).

Use this for simple plugins with no host-passed config. For secrets/options, use the factory.

---

## 3. Implement `BaseProvider`

### Required members

| Member | Type | Notes |
|--------|------|--------|
| `id` | `string` | Unique, URL-safe. Shown on OMSS home and in `?provider=` |
| `name` | `string` | Human-readable |
| `enabled` | `boolean` | Host skips disabled providers when resolving sources |
| `BASE_URL` | `string` | Upstream origin you scrape/call |
| `HEADERS` | `Record<string, string>` | Default headers (Referer, User-Agent, …) |
| `capabilities` | `ProviderCapabilities` | `supportedContentTypes`: `'movies' \| 'tv' \| 'sub'` |
| `getMovieSources(media)` | `Promise<ProviderResult>` | Movie scrape |
| `getTVSources(media)` | `Promise<ProviderResult>` | Episode scrape |

Optional override: `healthCheck(): Promise<boolean>` (default uses `enabled`).

### Input: `ProviderMediaObject`

Built by the framework from TMDB before your methods run:

```ts
{
  type: 'movie' | 'tv'
  tmdbId: string
  title: string
  releaseYear: string
  imdbId: string
  s?: number   // season (TV)
  e?: number   // episode (TV)
}
```

Use `tmdbId` / title / year / imdbId as your upstream query keys. Do not expect the host to pass arbitrary custom IDs on the OMSS HTTP path (v1.1 is TMDB-based).

### Output: `ProviderResult`

```ts
{
  sources: Source[]
  subtitles: Subtitle[]
  diagnostics: Diagnostic[]
}
```

**Source** (framework / typical fields):

| Field | Required | Notes |
|-------|----------|--------|
| `url` | yes | Prefer `this.createProxyUrl(upstream, headers)` for browser-safe URLs |
| `type` | yes | `'hls' \| 'dash' \| 'mp4' \| 'mkv' \| 'webm' \| 'http' \| 'embed'` |
| `quality` | yes | e.g. `'1080p'`, `'720p'`, `'unknown'` (framework-oriented) |
| `audioTracks` | yes | `{ language, label }[]` |
| `provider` | yes | `{ id: this.id, name: this.name }` |

**Subtitle:** `url`, `label`, `format` (`'vtt' \| 'srt' \| …`).

**Diagnostic** (non-fatal issues):

```ts
{
  code: 'PROVIDER_ERROR' | 'PARTIAL_SCRAPE' | /* other framework codes */
  message: string
  field: string    // often ''
  severity: 'info' | 'warning' | 'error'
}
```

On failure, prefer returning empty `sources` plus a `PROVIDER_ERROR` diagnostic over throwing. Throwing is caught by the framework and turned into a diagnostic, but structured returns are clearer.

### Proxy URLs

```ts
const url = this.createProxyUrl(upstreamStreamUrl, this.HEADERS)
```

That produces a host `/v1/proxy?data=...` URL suitable for `platform=web`. Do not invent a parallel proxy format.

Helpers on `BaseProvider`: `inferQuality`, `inferType`, `createRelativeProxyUrl`, `this.console.*` (dev logging).

---

## 4. Full plugin skeleton

```ts
import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
} from '@omss/framework'

export interface MyPluginConfig {
  id?: string
  name?: string
  apiKey?: string
  baseUrl?: string
}

export class MySiteProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly apiKey: string

  constructor(config: MyPluginConfig = {}) {
    super()
    this.id = config.id ?? 'my-site'
    this.name = config.name ?? 'My Site'
    this.BASE_URL = config.baseUrl ?? 'https://my-site.example'
    this.apiKey =
      config.apiKey ?? process.env.MY_SITE_API_KEY ?? ''
    this.HEADERS = {
      Referer: this.BASE_URL,
      'User-Agent': 'omss-my-site-provider',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    }
  }

  async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
    try {
      // 1. Call upstream with media.tmdbId / title / imdbId
      // 2. Map streams → Source objects
      const upstream = `${this.BASE_URL}/stream/${media.tmdbId}.m3u8`

      return {
        sources: [
          {
            url: this.createProxyUrl(upstream, this.HEADERS),
            type: 'hls',
            quality: this.inferQuality(upstream),
            audioTracks: [{ language: 'en', label: 'English' }],
            provider: { id: this.id, name: this.name },
          },
        ],
        subtitles: [],
        diagnostics: [],
      }
    } catch (error) {
      return {
        sources: [],
        subtitles: [],
        diagnostics: [
          {
            code: 'PROVIDER_ERROR',
            message: `${this.name} failed: ${
              error instanceof Error ? error.message : 'unknown'
            }`,
            field: '',
            severity: 'error',
          },
        ],
      }
    }
  }

  async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
    // Same pattern using media.s / media.e
    return { sources: [], subtitles: [], diagnostics: [] }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(this.BASE_URL, { method: 'HEAD' })
      return res.ok
    } catch {
      return false
    }
  }
}

export function createOmssProviders(config: MyPluginConfig = {}): BaseProvider[] {
  return [new MySiteProvider(config)]
}
```

Working sample: [`plugins/sample-provider-plugin/src/index.ts`](../plugins/sample-provider-plugin/src/index.ts).

---

## 5. Package layout

Recommended npm package:

```text
my-omss-provider/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts          # createOmssProviders + BaseProvider class(es)
└── dist/                 # compiled ESM (or CJS if you must)
```

### `package.json` checklist

```json
{
  "name": "my-omss-provider",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "peerDependencies": {
    "@omss/framework": "^1.1.0"
  },
  "engines": {
    "node": ">=20.6.0"
  }
}
```

Notes:

- **`peerDependencies` on `@omss/framework`** — the host supplies the framework; do not bundle a second copy if you can avoid it.
- **ESM (`"type": "module"`)** matches this host.
- Export the **package root** (`.`) so `"package": "my-omss-provider"` resolves cleanly.

Local `file:` packages during development work the same way (see this repo’s sample plugin).

---

## 6. Host registration

After `npm install my-omss-provider`, add to [`config/providers.json`](../config/providers.example.json):

```json
{
  "localDirectories": ["./src/providers"],
  "plugins": [
    {
      "package": "my-omss-provider",
      "enabled": true,
      "config": {
        "id": "my-site",
        "apiKey": "optional-override"
      }
    }
  ],
  "disabled": []
}
```

| Field | Effect |
|-------|--------|
| `package` | npm name, or relative path to a module file |
| `enabled` | If `false`, load instance but leave `enabled` off |
| `config` | Passed only to `createOmssProviders(config)` |

Restart the server (or `POST /admin/providers/reload`). Confirm on `GET /` that `providers[].id` includes yours.

Env alternative (no config bag):

```env
OMSS_PROVIDER_PLUGINS=my-omss-provider
```

---

## 7. Configuration & secrets

| Prefer | Avoid |
|--------|--------|
| `process.env.MY_PROVIDER_KEY` inside the plugin | Hardcoding keys in the host |
| Host `config` for non-secret toggles (id, baseUrl, quality caps) | Putting secrets in committed `providers.json` |
| Document required env vars in the plugin README | Inventing host-level secret APIs |

Example:

```ts
this.apiKey = config.apiKey ?? process.env.MY_SITE_API_KEY ?? ''
if (!this.apiKey) {
  this.console.warn('MY_SITE_API_KEY missing — provider may fail')
}
```

---

## 8. Behavior expectations

1. **Id uniqueness** — Duplicate `id` values are skipped with a warning. Coordinate ids across plugins.
2. **Capabilities** — Only declare content types you implement. Movies-only plugins should omit `'tv'` (or return empty TV results + diagnostics).
3. **Isolation** — One provider failing must not crash the process; return diagnostics / empty sources.
4. **No custom HTTP API** — Plugins do not register Fastify routes for OMSS. Sources flow through the framework only.
5. **No custom provider interface** — Do not export `MyProviderProtocol` for the host to adapt. Export `BaseProvider`.
6. **URL probing** — In non-test mode the framework may HEAD/GET your stream URLs. Unreachable demo URLs get filtered unless `INTERNAL_DEBUG=true` / `NODE_ENV=test`.

---

## 9. Testing your plugin

### Isolate the provider (no HTTP server)

```ts
import { createOmssProviders } from 'my-omss-provider'
import type { ProviderMediaObject } from '@omss/framework'

const [provider] = createOmssProviders({ apiKey: 'test' })

const media: ProviderMediaObject = {
  type: 'movie',
  tmdbId: '155',
  title: 'The Dark Knight',
  releaseYear: '2008',
  imdbId: 'tt0468569',
}

const result = await provider.getMovieSources(media)
console.log(result.sources.length, result.diagnostics)
```

### Against this host

1. Add the plugin to `config/providers.json`
2. Set `TMDB_API_KEY` and run `npm run dev`
3. `GET /` → provider listed  
4. `GET /v1/movies/155` → your `provider.id` appears on sources  
5. `POST /admin/providers/<id>/disable` → removed from home / not executed  

This repo’s suite: `npm test` (`tests/compatibility/providers.test.ts`, `tests/unit/loader.test.ts`).

---

## 10. Checklist before publishing

- [ ] Extends `@omss/framework` `BaseProvider` (no parallel interface)
- [ ] Exports `createOmssProviders` (preferred) or constructable class exports
- [ ] Stable unique `id`
- [ ] `capabilities` match implemented methods
- [ ] Returns `ProviderResult` shape; failures → diagnostics
- [ ] Uses `createProxyUrl` for playable web URLs
- [ ] Secrets via env / config, not hardcoded
- [ ] `peerDependencies`: `@omss/framework`
- [ ] Built ESM entry in `package.json` `exports`
- [ ] README: install, env vars, example `providers.json` snippet

---

## 11. Common mistakes

| Mistake | Fix |
|---------|-----|
| Custom `interface Provider { search() }` | Use `BaseProvider` only |
| Returning raw upstream URLs without proxy when you need CORS-free web playback | `createProxyUrl` |
| Throwing on empty catalog | Return `{ sources: [], subtitles: [], diagnostics: [...] }` |
| Non-unique `id` | Namespace ids (`acme-streams`, not `provider`) |
| Bundling a second `@omss/framework` | Peer dependency; let the host provide it |
| Expecting search/catalog OMSS routes | Out of OMSS scope — TMDB is the client’s job |

---

## 12. Local drop-in vs plugin

| | Local `src/providers/*.ts` | Plugin package |
|--|---------------------------|----------------|
| Discovery | `discoverProviders` | `createOmssProviders` / class exports |
| Config bag | Usually env only | `config` in `providers.json` |
| Distribution | Stays in this repo | `npm install` / private registry |
| Runtime type | Same `BaseProvider` | Same `BaseProvider` |

A local file can also export `createOmssProviders` and be listed under `plugins` with a path — see [PROVIDERS.md](./PROVIDERS.md).
