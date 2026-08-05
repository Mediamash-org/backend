import { BaseProvider } from '@omss/framework'
import type {
  Diagnostic,
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
  Subtitle,
} from '@omss/framework'
import { decryptPeachifyPayload } from './decrypt.js'
import type {
  PeachifyApiResponse,
  PeachifyParsedSource,
  PeachifyParsedSubtitle,
  PeachifyRawSource,
  PeachifyRawSubtitle,
} from './types.js'

export interface PeachifyPluginConfig {
  id?: string
  name?: string
  /** Embed / referer origin (docs: peachify.pro → player at peachify.top) */
  baseUrl?: string
  movieboxUrl?: string
  apiUrl?: string
  /** Optional subset of server path suffixes, e.g. ["holly","air","multi"] */
  servers?: string[]
  timeoutMs?: number
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const DEFAULT_SERVER_PATHS = [
  'holly',
  'air',
  'multi',
  'moviebox',
  'net',
] as const

/**
 * Peachify OMSS provider — scrapes peachify.top backend APIs for direct streams.
 *
 * Public embed docs: https://peachify.pro/
 *   movie: https://peachify.top/embed/movie/{tmdbId}
 *   tv:    https://peachify.top/embed/tv/{tmdbId}/{season}/{episode}
 *
 * Stream extraction hits parallel JSON APIs (optional AES-GCM payloads).
 */
export class PeachifyProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly movieboxUrl: string
  private readonly apiUrl: string
  private readonly serverUrls: string[]
  private readonly timeoutMs: number

  constructor(config: PeachifyPluginConfig = {}) {
    super()
    this.id = config.id ?? 'peachify'
    this.name = config.name ?? 'Peachify'
    this.BASE_URL = (
      config.baseUrl ??
      process.env.PEACHIFY_BASE_URL ??
      'https://peachify.top'
    ).replace(/\/$/, '')
    this.movieboxUrl = (
      config.movieboxUrl ??
      process.env.PEACHIFY_MOVIEBOX_URL ??
      'https://uwu.eat-peach.sbs'
    ).replace(/\/$/, '')
    this.apiUrl = (
      config.apiUrl ??
      process.env.PEACHIFY_API_URL ??
      'https://usa.eat-peach.sbs'
    ).replace(/\/$/, '')
    this.timeoutMs = config.timeoutMs ?? Number(process.env.PEACHIFY_TIMEOUT_MS ?? 20_000)

    const paths =
      config.servers ??
      (process.env.PEACHIFY_SERVERS?.split(',').map((s) => s.trim()).filter(Boolean) ||
        [...DEFAULT_SERVER_PATHS])

    this.serverUrls = paths.map((path) => {
      const clean = path.replace(/^\//, '')
      if (clean.includes('://')) return clean.replace(/\/$/, '')
      // From peachify.top player: holly/air/multi → usa; moviebox/net → uwu
      if (clean === 'holly' || clean === 'air' || clean === 'multi') {
        return `${this.apiUrl}/${clean}`
      }
      return `${this.movieboxUrl}/${clean}`
    })

    this.HEADERS = {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, text/javascript, */*; q=0.01',
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
    return this.enabled
  }

  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log(`Fetching Peachify sources (${this.serverUrls.length} servers)`, media)

    const settled = await Promise.allSettled(
      this.serverUrls.map((server) => this.fetchFromServer(server, media)),
    )

    const sources: Source[] = []
    const subtitles: Subtitle[] = []
    const diagnostics: Diagnostic[] = []
    let failCount = 0

    for (const result of settled) {
      if (result.status === 'rejected' || !result.value) {
        failCount++
        continue
      }
      sources.push(...result.value.sources)
      subtitles.push(...result.value.subtitles)
    }

    if (failCount > 0 && sources.length > 0) {
      diagnostics.push({
        code: 'PARTIAL_SCRAPE',
        message: `${failCount} of ${this.serverUrls.length} Peachify servers failed`,
        field: '',
        severity: 'warning',
      })
    }

    if (sources.length === 0) {
      return {
        sources: [],
        subtitles: [],
        diagnostics: [
          {
            code: 'PROVIDER_ERROR',
            message: `${this.name}: all servers returned no sources for TMDB ${media.tmdbId}`,
            field: '',
            severity: 'error',
          },
        ],
      }
    }

    return {
      sources: this.dedupeByUrl(sources),
      subtitles: this.dedupeSubs(subtitles),
      diagnostics,
    }
  }

  private async fetchFromServer(
    serverBase: string,
    media: ProviderMediaObject,
  ): Promise<{ sources: Source[]; subtitles: Subtitle[] } | null> {
    const apiUrl = this.buildApiUrl(serverBase, media)
    const serverName = new URL(serverBase).pathname.replace(/^\//, '') || 'peachify'

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(apiUrl, {
        headers: this.HEADERS,
        signal: controller.signal,
      })
      if (!response.ok) return null

      let body = (await response.json()) as PeachifyApiResponse

      if (body.isEncrypted && body.data) {
        const decrypted = await decryptPeachifyPayload(body.data)
        if (!decrypted) return null
        body = decrypted
      }

      const rawSources = Array.isArray(body.sources) ? body.sources : []
      const rawSubtitles = Array.isArray(body.subtitles) ? body.subtitles : []
      if (rawSources.length === 0) return null

      const parsed = rawSources
        .map((s) => this.parseSource(s, serverName))
        .filter((s): s is PeachifyParsedSource => s !== null)

      const parsedSubs = rawSubtitles
        .map((s) => this.parseSubtitle(s))
        .filter((s): s is PeachifyParsedSubtitle => s !== null)

      const sources: Source[] = parsed.map((s) => ({
        url: this.createProxyUrl(s.url, s.headers ?? this.HEADERS),
        type: s.type,
        quality: s.quality,
        audioTracks: [
          {
            label: s.dub,
            language: s.dub.toLowerCase().slice(0, 8),
          },
        ],
        provider: { id: this.id, name: `${this.name}/${s.server}` },
      }))

      const subtitles: Subtitle[] = parsedSubs.map((s) => ({
        url: this.createProxyUrl(s.url, this.HEADERS),
        label: s.label,
        format: s.url.toLowerCase().includes('.srt') ? 'srt' : 'vtt',
      }))

      return { sources, subtitles }
    } catch (error) {
      this.console.warn(
        `server ${serverBase} failed: ${error instanceof Error ? error.message : 'unknown'}`,
      )
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  private buildApiUrl(serverBase: string, media: ProviderMediaObject): string {
    if (media.type === 'movie') {
      return `${serverBase}/movie/${media.tmdbId}`
    }
    const season = media.s ?? 1
    const episode = media.e ?? 1
    return `${serverBase}/tv/${media.tmdbId}/${season}/${episode}`
  }

  private parseSource(
    raw: PeachifyRawSource,
    server: string,
  ): PeachifyParsedSource | null {
    const url = this.pickString(raw, [
      'url',
      'src',
      'file',
      'stream',
      'streamUrl',
      'playbackUrl',
    ])
    if (!url) return null

    const rawType = this.pickString(raw, ['type', 'format', 'container']).toLowerCase()
    const type: 'hls' | 'mp4' =
      rawType.includes('hls') ||
      rawType.includes('m3u8') ||
      url.toLowerCase().includes('.m3u8')
        ? 'hls'
        : 'mp4'

    const rawDub = this.pickString(raw, [
      'dub',
      'audio',
      'audioName',
      'audioLang',
      'language',
      'lang',
      'label',
      'name',
      'title',
    ])
    const dub = this.normalizeDubLabel(rawDub)
    const qualityNum = this.pickNumber(raw, ['quality', 'resolution', 'height', 'res'])
    const quality = qualityNum ? this.mapQuality(qualityNum) : this.inferQuality(url)

    const rawHeaders =
      raw.headers ?? raw.header ?? raw.requestHeaders ?? raw.httpHeaders
    const headers = this.normalizeHeaders(rawHeaders as Record<string, unknown> | undefined)

    return { url, dub, type, quality, headers, server }
  }

  private parseSubtitle(raw: PeachifyRawSubtitle): PeachifyParsedSubtitle | null {
    const url = raw.url ?? raw.file ?? raw.src
    if (!url) return null
    return {
      url,
      label: raw.label ?? raw.name ?? raw.language ?? 'Unknown',
    }
  }

  private pickString(obj: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const val = obj[key]
      if (typeof val === 'string' && val.trim()) return val.trim()
    }
    return ''
  }

  private pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
      const val = obj[key]
      if (typeof val === 'number' && Number.isFinite(val)) return val
      if (typeof val === 'string' && val.trim()) {
        const match = val.match(/\d{3,4}/)
        if (match) return Number(match[0])
        const parsed = Number(val)
        if (Number.isFinite(parsed)) return parsed
      }
    }
    return undefined
  }

  private mapQuality(height: number): string {
    if (height >= 2160) return '2160p'
    if (height >= 1080) return '1080p'
    if (height >= 720) return '720p'
    if (height >= 480) return '480p'
    if (height >= 360) return '360p'
    return 'unknown'
  }

  private normalizeDubLabel(raw: string): string {
    if (!raw.trim()) return 'Original'
    const lower = raw.trim().toLowerCase()
    if (lower === 'dubbed') return 'Dub'
    if (lower === 'subbed') return 'Sub'
    return raw.trim()
  }

  private normalizeHeaders(
    raw: Record<string, unknown> | undefined,
  ): Record<string, string> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const entries = Object.entries(raw)
      .filter(([k, v]) => k.trim().length > 0 && v != null)
      .map(([k, v]): [string, string] => [k, String(v)])
    return entries.length ? Object.fromEntries(entries) : undefined
  }

  private dedupeByUrl(sources: Source[]): Source[] {
    const seen = new Set<string>()
    return sources.filter((s) => {
      if (seen.has(s.url)) return false
      seen.add(s.url)
      return true
    })
  }

  private dedupeSubs(subs: Subtitle[]): Subtitle[] {
    const seen = new Set<string>()
    return subs.filter((s) => {
      if (seen.has(s.url)) return false
      seen.add(s.url)
      return true
    })
  }
}

export function createOmssProviders(config: PeachifyPluginConfig = {}): BaseProvider[] {
  return [new PeachifyProvider(config)]
}
