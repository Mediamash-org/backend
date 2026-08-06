import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
  Subtitle,
} from '@omss/framework'

export interface VidCorePluginConfig {
  id?: string
  name?: string
  primaryBaseUrl?: string
  fallbackBaseUrl?: string
  subtitleBaseUrl?: string
  timeoutMs?: number
  maxStreams?: number
  includeFallback?: boolean
}

type PrimaryStreamResponse = {
  server?: string
  sources?: Array<{ url?: string; quality?: string; type?: string }>
  subtitles?: Array<{
    url?: string
    language?: string
    lang?: string
    label?: string
    display?: string
  }>
}

type FallbackStreamResponse = {
  providers?: Array<{
    name?: string
    sources?: Array<{
      url?: string
      quality?: string
      type?: string
      language?: string
    }>
  }>
}

type VdrkSubtitle = {
  label?: string
  file?: string
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/**
 * OMSS provider for VidCore (`vidcore.org` / `vidcore.net`) using the
 * public movienig.ht + streamguide.cfd backends that power its embed player.
 */
export class VidCoreProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly primaryBaseUrl: string
  private readonly fallbackBaseUrl: string
  private readonly subtitleBaseUrl: string
  private readonly timeoutMs: number
  private readonly maxStreams: number
  private readonly includeFallback: boolean

  constructor(config: VidCorePluginConfig = {}) {
    super()
    this.id = config.id ?? 'vidcore'
    this.name = config.name ?? 'VidCore'
    this.BASE_URL = 'https://vidcore.org'
    this.primaryBaseUrl = (
      config.primaryBaseUrl ??
      process.env.VIDCORE_PRIMARY_BASE_URL ??
      'https://movienig.ht'
    ).replace(/\/$/, '')
    this.fallbackBaseUrl = (
      config.fallbackBaseUrl ??
      process.env.VIDCORE_FALLBACK_BASE_URL ??
      'https://streamguide.cfd'
    ).replace(/\/$/, '')
    this.subtitleBaseUrl = (
      config.subtitleBaseUrl ??
      process.env.VIDCORE_SUBTITLE_BASE_URL ??
      'https://sub.vdrk.site'
    ).replace(/\/$/, '')
    this.timeoutMs =
      config.timeoutMs ?? Number(process.env.VIDCORE_TIMEOUT_MS ?? 20_000)
    this.maxStreams =
      config.maxStreams ?? Number(process.env.VIDCORE_MAX_STREAMS ?? 4)
    this.includeFallback =
      config.includeFallback ??
      String(process.env.VIDCORE_INCLUDE_FALLBACK ?? 'true').toLowerCase() !==
        'false'

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
      const response = await fetch(
        `${this.primaryBaseUrl}/api/stream/v1/movie/27205?title=gg&year=1995&imdbId=gg&server=london`,
        {
          method: 'GET',
          headers: this.HEADERS,
        },
      )
      return response.ok
    } catch {
      return false
    }
  }

  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching VidCore sources', media)

    try {
      const tmdbId = String(media.tmdbId || '').trim()
      if (!/^\d+$/.test(tmdbId)) {
        return this.emptyResult('Missing numeric TMDB id')
      }

      const season = media.s ?? 1
      const episode = media.e ?? 1
      const isTv = media.type === 'tv'

      const primaryPath = isTv
        ? `/api/stream/v1/tv/${tmdbId}/${season}/${episode}`
        : `/api/stream/v1/movie/${tmdbId}`
      const primaryUrl =
        `${this.primaryBaseUrl}${primaryPath}` +
        `?title=gg&year=1995&imdbId=gg&server=london`

      const fallbackUrl = isTv
        ? `${this.fallbackBaseUrl}/Perses/tv/${tmdbId}/${season}/${episode}?verify=true`
        : `${this.fallbackBaseUrl}/Perses/movie/${tmdbId}?verify=true`

      const subPath = isTv
        ? `/v2/tv/${tmdbId}/${season}/${episode}`
        : `/v2/movie/${tmdbId}`

      const [primary, fallback, vdrkSubs] = await Promise.all([
        this.fetchJson<PrimaryStreamResponse>(primaryUrl),
        this.includeFallback
          ? this.fetchJson<FallbackStreamResponse>(fallbackUrl)
          : Promise.resolve(null),
        this.fetchJson<VdrkSubtitle[]>(`${this.subtitleBaseUrl}${subPath}`),
      ])

      const streamHeaders = {
        Accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*',
        'User-Agent': DEFAULT_UA,
        Referer: `${this.BASE_URL}/`,
        Origin: this.BASE_URL,
      }

      const sources: Source[] = []
      const seen = new Set<string>()

      const pushSource = (rawUrl: string, label: string, quality = 'Auto') => {
        const url = String(rawUrl || '').trim()
        if (!url || seen.has(url) || sources.length >= this.maxStreams) return
        seen.add(url)
        sources.push({
          url: this.createProxyUrl(url, streamHeaders),
          type: 'hls',
          quality,
          audioTracks: [{ label: 'Default', language: 'en' }],
          provider: {
            id: this.id,
            name: `${this.name}/${label}`,
          },
        })
      }

      const primaryServer = String(primary?.server || 'primary').trim() || 'primary'
      for (const row of primary?.sources ?? []) {
        if (String(row.type || 'hls').toLowerCase() !== 'hls') continue
        pushSource(
          String(row.url || ''),
          primaryServer,
          String(row.quality || 'Auto'),
        )
      }

      for (const provider of fallback?.providers ?? []) {
        const name = String(provider.name || 'mirror').trim() || 'mirror'
        for (const row of provider.sources ?? []) {
          if (String(row.type || 'hls').toLowerCase() !== 'hls') continue
          pushSource(
            String(row.url || ''),
            name,
            String(row.quality || 'Auto'),
          )
        }
      }

      if (!sources.length) {
        return this.emptyResult('No HLS sources returned by VidCore backends')
      }

      const subtitles = this.buildSubtitles(vdrkSubs, primary?.subtitles)

      return { sources, subtitles, diagnostics: [] }
    } catch (error) {
      return this.emptyResult(
        error instanceof Error ? error.message : 'Unknown provider error',
      )
    }
  }

  private buildSubtitles(
    vdrk: VdrkSubtitle[] | null,
    primarySubs:
      | PrimaryStreamResponse['subtitles']
      | undefined,
  ): Subtitle[] {
    const streamHeaders = {
      Accept: 'text/vtt,text/plain,*/*',
      'User-Agent': DEFAULT_UA,
      Referer: `${this.BASE_URL}/`,
      Origin: this.BASE_URL,
    }

    const out: Subtitle[] = []
    const seen = new Set<string>()

    const push = (rawUrl: string, label: string) => {
      const url = String(rawUrl || '').trim()
      const cleanLabel = String(label || '').trim() || 'Subtitle'
      if (!url || seen.has(url)) return
      seen.add(url)
      const lower = url.toLowerCase()
      out.push({
        url: this.createProxyUrl(url, streamHeaders),
        label: cleanLabel,
        format: lower.includes('.srt') ? 'srt' : 'vtt',
      })
    }

    // Prefer dedicated VTT cache (clean labels / multiple languages).
    if (Array.isArray(vdrk)) {
      for (const row of vdrk) {
        push(String(row.file || ''), String(row.label || 'Subtitle'))
      }
    }

    // Fall back to primary API subtitles if VDRK is empty.
    if (!out.length && Array.isArray(primarySubs)) {
      for (const row of primarySubs) {
        const label =
          row.display || row.label || row.language || row.lang || 'Subtitle'
        push(String(row.url || ''), String(label))
      }
    }

    // Prefer English first, then keep the rest (cap to avoid huge lists).
    const preferred = out.filter((s) => /english/i.test(s.label))
    const rest = out.filter((s) => !/english/i.test(s.label))
    return [...preferred, ...rest].slice(0, 12)
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, {
        headers: this.HEADERS,
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

export function createOmssProviders(
  config: VidCorePluginConfig = {},
): BaseProvider[] {
  return [new VidCoreProvider(config)]
}
