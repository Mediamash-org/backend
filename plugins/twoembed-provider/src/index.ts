import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
  Subtitle,
} from '@omss/framework'

export interface TwoEmbedPluginConfig {
  id?: string
  name?: string
  /** Marketing / docs origin */
  baseUrl?: string
  /** Player host that serves JWPlayer pages with `sources` */
  streamHost?: string
  timeoutMs?: number
}

type XPassPlaylistResponse = {
  playlist?: Array<{ sources?: RawSource[] }>
}
type RawSource = { file?: string; type?: string; label?: string; id?: string }
type RawTrack = { file?: string; label?: string; kind?: string; language?: string; url?: string }

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/**
 * OMSS provider for [2Embed](https://www.2embed.online/).
 *
 * Public embeds can lead to dead VIP sources. 2Embed also links to an `xpass`
 * fallback which serves a stable player page with a playlist JSON endpoint and
 * a subtitle API.
 *
 * Movie: `/e/movie/{id}`
 * TV:    `/e/tv/{id}/{season}/{episode}`
 */
export class TwoEmbedProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly streamHost: string
  private readonly timeoutMs: number

  constructor(config: TwoEmbedPluginConfig = {}) {
    super()
    this.id = config.id ?? '2embed'
    this.name = config.name ?? '2Embed'
    this.BASE_URL = (
      config.baseUrl ??
      process.env.TWOEMBED_BASE_URL ??
      'https://www.2embed.online'
    ).replace(/\/$/, '')
    this.streamHost = (
      config.streamHost ??
      process.env.TWOEMBED_STREAM_HOST ??
      'https://play.xpass.top'
    ).replace(/\/$/, '')
    this.timeoutMs = config.timeoutMs ?? Number(process.env.TWOEMBED_TIMEOUT_MS ?? 20_000)

    this.HEADERS = {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://streamsrcs.2embed.cc/',
      Origin: 'https://streamsrcs.2embed.cc',
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
      const response = await fetch(this.BASE_URL, {
        method: 'HEAD',
        headers: this.HEADERS,
      })
      return response.ok
    } catch {
      return false
    }
  }

  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching 2Embed sources', media)

    try {
      const pageUrl = this.buildPageUrl(media)
      const html = await this.fetchPage(pageUrl)
      if (!html) {
        return this.emptyResult(`Failed to fetch xpass page (${pageUrl})`)
      }

      const playlistUrl = this.extractPlaylistUrl(html)
      if (!playlistUrl) {
        return this.emptyResult('No playlist URL found on xpass page')
      }

      const playlist = await this.fetchJson<XPassPlaylistResponse>(
        new URL(playlistUrl, `${this.streamHost}/`).href,
      )
      const rawSources = Array.isArray(playlist?.playlist?.[0]?.sources)
        ? playlist.playlist[0].sources
        : []
      if (!rawSources.length) {
        return this.emptyResult('Playlist JSON contained no sources')
      }

      const streamHeaders = {
        ...this.HEADERS,
        Referer: `${this.streamHost}/`,
        Origin: this.streamHost,
      }

      const sources = rawSources
        .map((raw) => this.mapSource(raw, streamHeaders))
        .filter((s): s is Source => s !== null)

      if (!sources.length) {
        return this.emptyResult('Playlist JSON contained no usable stream URLs')
      }

      const subtitleApiUrl = this.extractSubtitleApiUrl(html)
      const subtitleRows = subtitleApiUrl ? await this.fetchJson<RawTrack[]>(subtitleApiUrl) : []
      const subtitles: Subtitle[] = (Array.isArray(subtitleRows) ? subtitleRows : [])
        .map((t) => this.mapSubtitle(t, streamHeaders))
        .filter((s): s is Subtitle => s !== null)

      return { sources, subtitles, diagnostics: [] }
    } catch (error) {
      return this.emptyResult(
        error instanceof Error ? error.message : 'Unknown provider error',
      )
    }
  }

  private buildPageUrl(media: ProviderMediaObject): string {
    const id = media.imdbId || media.tmdbId
    if (media.type === 'movie') {
      return `${this.streamHost}/e/movie/${id}`
    }
    const season = media.s ?? 1
    const episode = media.e ?? 1
    return `${this.streamHost}/e/tv/${id}/${season}/${episode}`
  }

  private async fetchPage(url: string): Promise<string | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, {
        headers: this.HEADERS,
        signal: controller.signal,
      })
      if (!response.ok) return null
      return await response.text()
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, {
        headers: {
          ...this.HEADERS,
          Accept: 'application/json, text/plain, */*',
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

  private extractPlaylistUrl(html: string): string | null {
    return html.match(/playlist"\s*:\s*"([^"]+)"/i)?.[1] ?? null
  }

  private extractSubtitleApiUrl(html: string): string | null {
    return html.match(/var\s+suburl\s*=\s*"([^"]+)"/i)?.[1] ?? null
  }

  private mapSubtitle(
    raw: RawTrack,
    streamHeaders: Record<string, string>,
  ): Subtitle | null {
    const file = typeof raw.file === 'string' && raw.file.trim()
      ? raw.file.trim()
      : typeof raw.url === 'string' && raw.url.trim()
        ? raw.url.trim()
        : ''
    if (!file) return null

    const absolute = /^https?:\/\//i.test(file) ? file : new URL(file, 'https://sub.1x2.space/').href
    const label = raw.label ?? raw.language ?? 'Unknown'
    return {
      url: this.createProxyUrl(absolute, streamHeaders),
      label,
      format: absolute.toLowerCase().includes('.srt') ? 'srt' : 'vtt',
    }
  }

  private mapSource(
    raw: RawSource,
    streamHeaders: Record<string, string>,
  ): Source | null {
    const file = typeof raw.file === 'string' ? raw.file.trim() : ''
    if (!file || !/^https?:\/\//i.test(file)) return null

    const rawType = (raw.type ?? '').toLowerCase()
    const type: 'hls' | 'mp4' =
      rawType.includes('mp4') || file.toLowerCase().includes('.mp4')
        ? 'mp4'
        : 'hls'

      const quality = this.inferSourceQuality(raw.label ?? file)

    return {
      url: this.createProxyUrl(file, streamHeaders),
      type,
      quality,
      audioTracks: [{ label: raw.label ?? 'English', language: 'eng' }],
      provider: { id: this.id, name: `${this.name}/xpass` },
    }
  }

  private inferSourceQuality(value: string): string {
    const match = value.match(/(2160|1080|720|480|360)p?/i)
    return match ? `${match[1]}p` : 'Auto'
  }

  private emptyResult(message: string): ProviderResult {
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

export function createOmssProviders(config: TwoEmbedPluginConfig = {}): BaseProvider[] {
  return [new TwoEmbedProvider(config)]
}
