import { BaseProvider } from '@omss/framework'
import type {
  Diagnostic,
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
  Subtitle,
} from '@omss/framework'

export interface BingrPluginConfig {
  id?: string
  name?: string
  /** Marketing site (Origin / Referer) */
  siteUrl?: string
  /** API root including /api suffix */
  apiUrl?: string
  /** Server ids to query, e.g. ["s11","s30","s3","s4"] */
  servers?: string[]
  /** Fetch extra VDRK subtitles when stream payload has few/none */
  fetchVdrkSubs?: boolean
  timeoutMs?: number
}

type BingrServer = { id: string; name: string }

type BingrDetails = {
  id?: number | string
  title?: string
  year?: string | number
  type?: string
}

type BingrStreamSource = {
  url?: string
  quality?: string
  language?: string
  type?: string
  label?: string
  name?: string
  headers?: Record<string, string>
}

type BingrSubtitle = {
  url?: string
  label?: string
  lang?: string
  language?: string
  source?: string
}

type BingrStreamResponse = {
  scraperName?: string
  sources?: BingrStreamSource[]
  subtitles?: BingrSubtitle[]
  error?: string
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/** Known Bingr scrapers (from bingr.one client bundle). */
export const BINGR_SERVERS: BingrServer[] = [
  { id: 's11', name: 'Sirius' },
  { id: 's40', name: 'DarkMatter' },
  { id: 's12', name: 'Quasar' },
  { id: 's30', name: 'Apollo' },
  { id: 's1', name: 'Miller' },
  { id: 's2', name: 'Mann' },
  { id: 's3', name: 'Edmunds' },
  { id: 's4', name: 'Luna' },
  { id: 's5', name: 'Aditya' },
]

const DEFAULT_SERVER_IDS = ['s11', 's30', 's3', 's4'] as const

const SERVER_NAME = Object.fromEntries(BINGR_SERVERS.map((s) => [s.id, s.name])) as Record<
  string,
  string
>

/**
 * OMSS provider for [Bingr](https://bingr.one/).
 *
 * Streams: `POST {apiUrl}/stream` with `{ srv, t, id, query }`
 * Details: `GET {apiUrl}/details/{movie|tv}/{tmdbId}`
 */
export class BingrProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly apiUrl: string
  private readonly serverIds: string[]
  private readonly fetchVdrkSubs: boolean
  private readonly timeoutMs: number

  constructor(config: BingrPluginConfig = {}) {
    super()
    this.id = config.id ?? 'bingr'
    this.name = config.name ?? 'Bingr'
    this.BASE_URL = (
      config.siteUrl ??
      process.env.BINGR_SITE_URL ??
      'https://bingr.one'
    ).replace(/\/$/, '')
    this.apiUrl = (
      config.apiUrl ??
      process.env.BINGR_API_URL ??
      'https://api.bingr.one/api'
    ).replace(/\/$/, '')
    this.timeoutMs = config.timeoutMs ?? Number(process.env.BINGR_TIMEOUT_MS ?? 20_000)
    this.fetchVdrkSubs =
      config.fetchVdrkSubs ??
      !['0', 'false', 'no'].includes(
        String(process.env.BINGR_FETCH_VDRK_SUBS ?? 'true').toLowerCase(),
      )

    const fromEnv = process.env.BINGR_SERVERS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    this.serverIds = (config.servers ?? fromEnv ?? [...DEFAULT_SERVER_IDS]).map((s) =>
      s.toLowerCase(),
    )

    this.HEADERS = {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: this.BASE_URL,
      Referer: `${this.BASE_URL}/`,
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
      const response = await this.fetchJson<{ status?: string }>(`${this.apiUrl}/health`)
      return response?.status === 'ok'
    } catch {
      return false
    }
  }

  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching Bingr sources', media)

    const tmdbId = String(media.tmdbId || '').trim()
    if (!tmdbId) {
      return this.emptyResult('Missing tmdbId')
    }

    const mediaType = media.type === 'tv' ? 'tv' : 'movie'
    if (mediaType === 'tv' && (media.s == null || media.e == null)) {
      return this.emptyResult('TV requests require season (s) and episode (e)')
    }

    try {
      const meta = await this.resolveMeta(media, mediaType, tmdbId)
      const query: Record<string, string> = {}
      if (meta.title) query.title = meta.title
      if (meta.year) query.year = meta.year
      if (mediaType === 'tv') {
        query.season = String(media.s)
        query.episode = String(media.e)
      }

      const settled = await Promise.all(
        this.serverIds.map((srv) => this.fetchStream(srv, mediaType, tmdbId, query)),
      )

      const sources: Source[] = []
      const subtitles: Subtitle[] = []
      const diagnostics: Diagnostic[] = []
      const seenUrls = new Set<string>()
      const seenSubs = new Set<string>()

      for (const row of settled) {
        if (row.diagnostic) diagnostics.push(row.diagnostic)
        for (const source of row.sources) {
          if (seenUrls.has(source.url)) continue
          seenUrls.add(source.url)
          sources.push(source)
        }
        for (const sub of row.subtitles) {
          if (seenSubs.has(sub.url)) continue
          seenSubs.add(sub.url)
          subtitles.push(sub)
        }
      }

      if (this.fetchVdrkSubs) {
        const extras = await this.fetchVdrkSubtitles(mediaType, tmdbId, media)
        for (const sub of extras) {
          if (seenSubs.has(sub.url)) continue
          seenSubs.add(sub.url)
          subtitles.push(sub)
        }
      }

      if (!sources.length) {
        return {
          sources: [],
          subtitles,
          diagnostics: diagnostics.length
            ? diagnostics
            : [
                {
                  code: 'PROVIDER_ERROR',
                  message: `${this.name}: No playable sources from servers ${this.serverIds.join(',')}`,
                  field: '',
                  severity: 'error',
                },
              ],
        }
      }

      return { sources, subtitles, diagnostics }
    } catch (error) {
      return this.emptyResult(error instanceof Error ? error.message : 'Unknown provider error')
    }
  }

  private async resolveMeta(
    media: ProviderMediaObject,
    mediaType: 'movie' | 'tv',
    tmdbId: string,
  ): Promise<{ title?: string; year?: string }> {
    const title = typeof media.title === 'string' ? media.title.trim() : ''
    const year =
      typeof media.releaseYear === 'string' || typeof media.releaseYear === 'number'
        ? String(media.releaseYear).trim()
        : ''
    if (title && year) return { title, year: year || undefined }
    if (title && !year) {
      // Still useful without year; try details for year only.
    }

    const details = await this.fetchJson<BingrDetails>(
      `${this.apiUrl}/details/${mediaType}/${encodeURIComponent(tmdbId)}`,
    )
    return {
      title: title || details?.title?.trim() || undefined,
      year: year || (details?.year != null ? String(details.year) : undefined),
    }
  }

  private async fetchStream(
    srv: string,
    mediaType: 'movie' | 'tv',
    tmdbId: string,
    query: Record<string, string>,
  ): Promise<{
    sources: Source[]
    subtitles: Subtitle[]
    diagnostic?: Diagnostic
  }> {
    const serverLabel = SERVER_NAME[srv] ?? srv
    try {
      const payload = await this.postJson<BingrStreamResponse>(`${this.apiUrl}/stream`, {
        srv,
        t: mediaType,
        id: tmdbId,
        query,
      })

      if (!payload) {
        return {
          sources: [],
          subtitles: [],
          diagnostic: {
            code: 'PROVIDER_ERROR',
            message: `${this.name}/${serverLabel}: empty response`,
            field: '',
            severity: 'warning',
          },
        }
      }

      if (payload.error) {
        return {
          sources: [],
          subtitles: [],
          diagnostic: {
            code: 'PROVIDER_ERROR',
            message: `${this.name}/${serverLabel}: ${payload.error}`,
            field: '',
            severity: 'warning',
          },
        }
      }

      const rawSources = Array.isArray(payload.sources) ? payload.sources : []
      const scraper = payload.scraperName || serverLabel
      const sources = rawSources
        .map((raw) => this.mapSource(raw, scraper))
        .filter((s): s is Source => s !== null)

      const rawSubs = Array.isArray(payload.subtitles) ? payload.subtitles : []
      const subtitles = this.mapSubtitles(rawSubs, rawSources[0]?.headers)

      return { sources, subtitles }
    } catch (error) {
      return {
        sources: [],
        subtitles: [],
        diagnostic: {
          code: 'PROVIDER_ERROR',
          message: `${this.name}/${serverLabel}: ${
            error instanceof Error ? error.message : 'request failed'
          }`,
          field: '',
          severity: 'warning',
        },
      }
    }
  }

  private mapSubtitles(
    rawSubs: BingrSubtitle[],
    sourceHeaders?: Record<string, string>,
  ): Subtitle[] {
    return rawSubs
      .map((raw) => this.mapSubtitle(raw, sourceHeaders))
      .filter((s): s is Subtitle => s !== null)
  }

  private async fetchVdrkSubtitles(
    mediaType: 'movie' | 'tv',
    tmdbId: string,
    media: ProviderMediaObject,
  ): Promise<Subtitle[]> {
    try {
      let path = `${this.apiUrl}/subtitles/vdrk/${mediaType}/${encodeURIComponent(tmdbId)}`
      if (mediaType === 'tv') {
        const params = new URLSearchParams({
          season: String(media.s ?? 1),
          ep: String(media.e ?? 1),
        })
        path += `?${params}`
      }
      const payload = await this.fetchJson<{ subtitles?: BingrSubtitle[] }>(path)
      const rows = Array.isArray(payload?.subtitles) ? payload.subtitles : []
      return rows
        .map((raw) => this.mapSubtitle(raw))
        .filter((s): s is Subtitle => s !== null)
    } catch {
      return []
    }
  }

  private mapSource(raw: BingrStreamSource, scraperName: string): Source | null {
    const file = typeof raw.url === 'string' ? raw.url.trim() : ''
    if (!file || !/^https?:\/\//i.test(file)) return null

    const rawType = (raw.type ?? '').toLowerCase()
    const type: 'hls' | 'mp4' | 'dash' =
      rawType.includes('dash') || file.includes('.mpd')
        ? 'dash'
        : rawType.includes('mp4') || file.toLowerCase().includes('.mp4')
          ? 'mp4'
          : 'hls'

    const streamHeaders = {
      ...this.HEADERS,
      ...(raw.headers ?? {}),
    }

    const quality = this.inferSourceQuality(raw.quality ?? raw.label ?? raw.name ?? file)
    const audioLabel = raw.language || raw.label || 'Default'

    return {
      url: this.createProxyUrl(file, streamHeaders),
      type,
      quality,
      audioTracks: [{ label: audioLabel, language: this.guessLang(raw.language) }],
      provider: { id: this.id, name: `${this.name}/${scraperName}` },
    }
  }

  private mapSubtitle(
    raw: BingrSubtitle,
    streamHeaders?: Record<string, string>,
  ): Subtitle | null {
    const file = typeof raw.url === 'string' ? raw.url.trim() : ''
    if (!file || !/^https?:\/\//i.test(file)) return null

    const headers = {
      ...this.HEADERS,
      ...(streamHeaders ?? {}),
    }

    return {
      url: this.createProxyUrl(file, headers),
      label: raw.label ?? raw.lang ?? raw.language ?? 'Unknown',
      format: file.toLowerCase().includes('.srt') ? 'srt' : 'vtt',
    }
  }

  private inferSourceQuality(value: string): string {
    const match = value.match(/(2160|1080|720|480|360)p?/i)
    if (match) return `${match[1]}p`
    if (/auto/i.test(value)) return 'Auto'
    return value.trim() || 'Auto'
  }

  private guessLang(value?: string): string {
    if (!value) return 'und'
    const v = value.toLowerCase()
    if (v.startsWith('en')) return 'eng'
    if (v.startsWith('hi')) return 'hin'
    if (v.startsWith('es')) return 'spa'
    if (v.startsWith('fr')) return 'fra'
    if (v.startsWith('de')) return 'deu'
    if (v.startsWith('ja')) return 'jpn'
    if (v.startsWith('ko')) return 'kor'
    return value.slice(0, 3).toLowerCase()
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

  private async postJson<T>(url: string, body: unknown): Promise<T | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.HEADERS,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (response.status >= 500) {
        const errBody = await response.json().catch(() => null)
        const message =
          errBody && typeof errBody === 'object' && 'error' in errBody
            ? String((errBody as { error: unknown }).error)
            : `HTTP ${response.status}`
        throw new Error(message)
      }
      if (!response.ok) {
        const errBody = await response.json().catch(() => null)
        const message =
          errBody && typeof errBody === 'object' && 'error' in errBody
            ? String((errBody as { error: unknown }).error)
            : `HTTP ${response.status}`
        throw new Error(message)
      }
      return (await response.json()) as T
    } finally {
      clearTimeout(timer)
    }
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

export function createOmssProviders(config: BingrPluginConfig = {}): BaseProvider[] {
  return [new BingrProvider(config)]
}
