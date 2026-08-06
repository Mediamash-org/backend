import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
} from '@omss/framework'

export interface VaultPlayerPluginConfig {
  id?: string
  name?: string
  baseUrl?: string
  timeoutMs?: number
  maxStreams?: number
}

type VaultResolveResponse = {
  success?: boolean
  streams?: Array<{ token?: string; format?: string }>
  message?: string
  error?: string
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/**
 * OMSS provider for VaultPlayer (`vaultplayer.co.uk`) using its public
 * IMDb-based resolver and tokenized HLS proxy.
 */
export class VaultPlayerProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly timeoutMs: number
  private readonly maxStreams: number
  private readonly tmdbApiKey: string

  constructor(config: VaultPlayerPluginConfig = {}) {
    super()
    this.id = config.id ?? 'vaultplayer'
    this.name = config.name ?? 'VaultPlayer'
    this.BASE_URL = (
      config.baseUrl ??
      process.env.VAULTPLAYER_BASE_URL ??
      'https://vaultplayer.co.uk'
    ).replace(/\/$/, '')
    this.timeoutMs =
      config.timeoutMs ?? Number(process.env.VAULTPLAYER_TIMEOUT_MS ?? 20_000)
    this.maxStreams =
      config.maxStreams ?? Number(process.env.VAULTPLAYER_MAX_STREAMS ?? 3)
    this.tmdbApiKey = process.env.TMDB_API_KEY ?? ''

    this.HEADERS = {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: `${this.BASE_URL}/`,
      Origin: this.BASE_URL,
    }
  }

  async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
    return this.getSources(media)
  }

  async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
    return this.getSources(media)
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.BASE_URL}/`, {
        method: 'HEAD',
        headers: this.HEADERS,
      })
      return response.ok
    } catch {
      return false
    }
  }

  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching VaultPlayer sources', media)

    try {
      const imdbId = await this.resolveImdbId(media)
      if (!imdbId) {
        return this.emptyResult('Missing IMDb id and TMDB fallback could not resolve one')
      }

      const params = new URLSearchParams({
        imdb: imdbId.toLowerCase(),
        type: media.type === 'tv' ? 'tv' : 'movie',
      })
      if (media.type === 'tv') {
        params.set('season', String(media.s ?? 1))
        params.set('episode', String(media.e ?? 1))
      }

      const json = await this.fetchJson<VaultResolveResponse>(
        `${this.BASE_URL}/resolve_stream.php?${params.toString()}`,
      )
      if (!json?.success) {
        const detail = json?.error || json?.message || 'Resolver returned no streams'
        return this.emptyResult(detail)
      }

      const rows = Array.isArray(json.streams) ? json.streams : []
      const tokens = dedupe(
        rows
          .filter((row) => String(row.format || '').toLowerCase() === 'hls')
          .map((row) => String(row.token || '').trim())
          .filter(Boolean),
      ).slice(0, this.maxStreams)

      if (!tokens.length) return this.emptyResult('No HLS tokens returned by VaultPlayer')

      const streamHeaders = {
        Accept: 'application/vnd.apple.mpegurl,text/plain,*/*',
        'User-Agent': DEFAULT_UA,
        Referer: `${this.BASE_URL}/`,
        Origin: this.BASE_URL,
      }

      const sources: Source[] = tokens.map((token, index) => ({
        url: this.createProxyUrl(
          `${this.BASE_URL}/vod_hls_proxy.php?token=${encodeURIComponent(token)}`,
          streamHeaders,
        ),
        type: 'hls',
        quality: 'Auto',
        audioTracks: [{ label: 'Default', language: 'en' }],
        provider: {
          id: this.id,
          name: `${this.name}/${index + 1}`,
        },
      }))

      return { sources, subtitles: [], diagnostics: [] }
    } catch (error) {
      return this.emptyResult(
        error instanceof Error ? error.message : 'Unknown provider error',
      )
    }
  }

  private async resolveImdbId(media: ProviderMediaObject): Promise<string | null> {
    const direct = String((media as ProviderMediaObject & { imdbId?: string }).imdbId || '').trim()
    if (/^tt\d+$/i.test(direct)) return direct.toLowerCase()

    const tmdbId = String(media.tmdbId || '').trim()
    if (!tmdbId || !this.tmdbApiKey) return null

    const path = media.type === 'tv' ? 'tv' : 'movie'
    const json = await this.fetchJson<{ imdb_id?: string | null }>(
      `https://api.themoviedb.org/3/${path}/${encodeURIComponent(
        tmdbId,
      )}/external_ids?api_key=${encodeURIComponent(this.tmdbApiKey)}`,
      {
        Accept: 'application/json',
        Referer: 'https://www.themoviedb.org/',
        Origin: 'https://www.themoviedb.org',
      },
    )
    const imdbId = String(json?.imdb_id || '').trim()
    return /^tt\d+$/i.test(imdbId) ? imdbId.toLowerCase() : null
  }

  private async fetchJson<T>(
    url: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<T | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, {
        headers: {
          ...this.HEADERS,
          ...extraHeaders,
        },
        signal: controller.signal,
      })
      if (!response.ok) return null
      return (await response.json()) as T
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  private emptyResult(message: string): ProviderResult {
    this.console.warn(message)
    return {
      sources: [],
      subtitles: [],
      diagnostics: [
        {
          code: 'PROVIDER_ERROR',
          message: `${this.name}: ${message}`,
          field: '',
          severity: 'error',
        },
      ],
    }
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

export function createOmssProviders(
  config: VaultPlayerPluginConfig = {},
): BaseProvider[] {
  return [new VaultPlayerProvider(config)]
}
