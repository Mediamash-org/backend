# @omss-server/netmirror-provider

OMSS **`BaseProvider`** plugin ported from the [NetMirror Cloudstream extension](../../NetMirror-Extension-master) (`NetMirrorProvider.kt`).

It resolves playable streams via **net27.cc** (`/api/variants-tmdb` → `/api/embed-tmdb`), optionally loading dub variants through aoneroom — same flow as the Kotlin extension’s `loadLinks`.

TMDB search / home catalogs from the extension are **not** ported: OMSS leaves metadata/search to TMDB; the host already supplies `ProviderMediaObject`.

## Install (this monorepo)

Already wired as a `file:` dependency. In [`config/providers.json`](../../config/providers.json):

```json
{
  "package": "@omss-server/netmirror-provider",
  "enabled": true,
  "config": {
    "id": "netmirror",
    "name": "NetMirror"
  }
}
```

## Config / env

| Key | Env | Default |
|-----|-----|---------|
| `baseUrl` | `NETMIRROR_BASE_URL` | `https://net27.cc` |
| `streamReferer` | `NETMIRROR_STREAM_REFERER` | `https://videodownloader.site/` |
| `fetchDubs` | `NETMIRROR_FETCH_DUBS` | `true` |
| `timeoutMs` | `NETMIRROR_TIMEOUT_MS` | `15000` |

## Build

```bash
npm run build --prefix plugins/netmirror-provider
```

## License / attribution

Logic derived from NetMirror-Extension (GPL-3.0). This plugin package is licensed **GPL-3.0-or-later**. Upstream README / DMCA notes apply to scraped third-party hosts — this package only performs HTTP fetches like a browser.
