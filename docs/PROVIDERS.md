# How to add an OMSS provider

This host uses the official [`@omss/framework`](https://github.com/omss-spec/framework) provider mechanism. Providers are **`BaseProvider` subclasses** — not a custom interface invented by this repo.

**Implementing a plugin from scratch?** Follow the step-by-step guide:

→ **[PROVIDER_PLUGIN_GUIDE.md](./PROVIDER_PLUGIN_GUIDE.md)** — contract, `BaseProvider` fields, package layout, config, testing, checklist

Spec / architecture context: [OMSS_SPEC.md](./OMSS_SPEC.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Ways to install providers

### 1. Local drop-in (official template style)

1. Create `src/providers/my-site.ts`
2. `export class MySiteProvider extends BaseProvider { ... }`
3. Restart (`npm run dev`)

The host scans `localDirectories` from [`config/providers.json`](../config/providers.json) (default `./src/providers`) via `ProviderRegistry.discoverProviders`.

### 2. Provider plugin (npm package)

Package a provider as a normal Node module that depends on `@omss/framework` and exports either:

**Preferred — factory (supports config):**

```ts
import { BaseProvider } from '@omss/framework'

export function createOmssProviders(config: Record<string, unknown> = {}): BaseProvider[] {
  return [new MyProvider(config)]
}
```

**Or — class exports** (same as local discovery):

```ts
export class MyProvider extends BaseProvider { /* ... */ }
```

Then install and register:

```bash
npm install my-omss-provider
```

[`config/providers.json`](../config/providers.example.json):

```json
{
  "localDirectories": ["./src/providers"],
  "plugins": [
    {
      "package": "my-omss-provider",
      "enabled": true,
      "config": { "apiKey": "from-env-or-here" }
    }
  ],
  "disabled": []
}
```

Or via env (comma-separated package names):

```env
OMSS_PROVIDER_PLUGINS=my-omss-provider,@scope/other-provider
```

This repo ships:

- Sample: [`plugins/sample-provider-plugin`](../plugins/sample-provider-plugin) (`@omss-server/sample-provider-plugin`)
- NetMirror port: [`plugins/netmirror-provider`](../plugins/netmirror-provider) (`@omss-server/netmirror-provider`) — see [PROVIDER_PLUGIN_GUIDE.md](./PROVIDER_PLUGIN_GUIDE.md)

### 3. Path module

`"package"` may also be a relative path to a module file:

```json
{ "package": "./plugins/sample-provider-plugin/src/index.ts", "enabled": true }
```

---

## Implementing `BaseProvider`

Required members (official framework):

| Member | Purpose |
|--------|---------|
| `id` | Unique URL-safe id |
| `name` | Human-readable name |
| `enabled` | Whether the host should execute it |
| `BASE_URL` / `HEADERS` | Upstream defaults |
| `capabilities.supportedContentTypes` | `movies` / `tv` / `sub` |
| `getMovieSources(media)` | Return `{ sources, subtitles, diagnostics }` |
| `getTVSources(media)` | Same for episodes |

Use `this.createProxyUrl(url, headers)` for `platform=web`-friendly URLs.

Provider-specific secrets: read `process.env` inside the provider (or accept `config` in `createOmssProviders`). Do not hardcode secrets into the host.

Minimal example: [`src/providers/example.ts`](../src/providers/example.ts).

---

## Configuration

| Source | Role |
|--------|------|
| `.env` / `TMDB_API_KEY` | Required by framework for TMDB validation |
| `config/providers.json` | Local dirs, plugin packages, disabled ids |
| `OMSS_PROVIDERS_CONFIG` | Override path to providers JSON |
| `OMSS_PROVIDER_PLUGINS` | Extra plugin packages |
| `OMSS_PROVIDERS_DISABLED` | Comma-separated ids to disable |
| `INTERNAL_DEBUG=true` | Skip live stream URL probes (dev / example providers) |

Copy [`config/providers.example.json`](../config/providers.example.json) if you need a fresh config.

---

## Enable / disable / reload (admin — not OMSS)

Separate from the OMSS protocol:

| Method | Path |
|--------|------|
| `GET` | `/admin/providers` |
| `GET` | `/admin/providers/health` |
| `POST` | `/admin/providers/:id/enable` |
| `POST` | `/admin/providers/:id/disable` |
| `POST` | `/admin/providers/reload` |

Disabled providers stay loaded but are omitted from OMSS home `providers[]` and are not executed for source requests (`getEnabledProviders`).

---

## Discovery → response path

```text
config / plugins / src/providers
        ↓
ProviderPluginManager.load()
        ↓
ProviderRegistry.register / discoverProviders
        ↓
GET /v1/movies/{tmdbId}  (OMSS)
        ↓
SourceService → enabled BaseProviders
        ↓
SourcesResponse (OMSS JSON)
```

Failure in one provider becomes diagnostics / empty sources for that provider; others still run (framework behavior).

---

## Compatibility expectations

- Existing providers written for the official [OMSS template](https://github.com/omss-spec/template) (`extends BaseProvider`) work as local files or as plugin packages without rewriting.
- Do not introduce a second provider interface.
- OMSS HTTP contract remains the OpenAPI v1.1 surface; admin routes stay under `/admin/*`.
