import crypto from 'crypto'
import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
} from '@omss/framework'

export interface PikashowPluginConfig {
  id?: string
  name?: string
  baseUrl?: string
  apiKey?: string
  hmacSecret?: string
  /** Preferred audio languages, in order */
  preferredLangs?: string[]
  /** Max language HLS sources to return */
  maxLangSources?: number
  timeoutMs?: number
}

type MovieRecord = {
  so?: number
  t?: string
  g?: string
  y?: number
  q?: string
  c?: string
  url?: string
  clientUrls?: Array<{ label?: string; url?: string }>
}

type SeriesRecord = {
  t?: string
  g?: string
  y?: number
  c?: string
  n?: number
  detail?: Array<{ year?: number; season?: string; episodes_count?: number }>
}

type Resolution = { label?: string; url?: string; width?: number; height?: number }
type LanguageOption = {
  language?: string
  playUrl?: string
  resolutions?: Resolution[]
}

type VideoData = {
  so?: number
  t?: string
  y?: number
  q?: string
  url?: string
  videoUrl?: string
  playUrl?: string
  sourceType?: string
  host?: string
  resolutions?: Resolution[]
  languages?: LanguageOption[]
  languageOptions?: LanguageOption[]
  headers?: Record<string, string>
  uaStr?: string
  uastr?: string
  heastr?: string
  headerStr?: string
  detail?: Array<{
    season?: string
    year?: number
    episodes?: Array<{
      e?: string
      url?: string
      playUrl?: string
      sourceType?: string
      host?: string
      resolutions?: Resolution[]
      languages?: LanguageOption[]
      languageOptions?: LanguageOption[]
      headers?: Record<string, string>
      uaStr?: string
      headerStr?: string
    }>
  }>
}

type VideoApiResponse = {
  code?: number
  message?: string
  data?: VideoData
}

type CatalogHit =
  | { kind: 'movie'; type: 'hollywood' | 'bollywood'; record: MovieRecord }
  | { kind: 'series'; type: 'series'; record: SeriesRecord }

/** Defaults recovered from the published CloudStream plugin binary. */
export const PIKASHOW_DEFAULT_API_KEY = 'picashow-api-secret-key'
export const PIKASHOW_DEFAULT_HMAC_SECRET = 'picashow-api-secret-2025'

const APP_UA =
  'Pikashow/2509030 (Android 13; Pixel 5; Channel/pikashow; gaid/{gaid}); Uuid/{uuid}'

/**
 * OMSS provider for Pikashow (`manoda.co`) — CloudStream port.
 */
export class PikashowProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly apiKey: string
  private readonly hmacSecret: string
  private readonly preferredLangs: string[]
  private readonly maxLangSources: number
  private readonly timeoutMs: number
  private readonly deviceUuid: string
  private readonly gaid: string

  constructor(config: PikashowPluginConfig = {}) {
    super()
    this.id = config.id ?? 'pikashow'
    this.name = config.name ?? 'Pikashow'
    this.BASE_URL = (
      config.baseUrl ??
      process.env.PIKASHOW_BASE_URL ??
      'https://manoda.co'
    ).replace(/\/$/, '')
    this.apiKey =
      config.apiKey ?? process.env.PIKASHOW_API_KEY ?? PIKASHOW_DEFAULT_API_KEY
    this.hmacSecret =
      config.hmacSecret ??
      process.env.PIKASHOW_HMAC_SECRET ??
      PIKASHOW_DEFAULT_HMAC_SECRET
    this.timeoutMs =
      config.timeoutMs ?? Number(process.env.PIKASHOW_TIMEOUT_MS ?? 25_000)
    this.maxLangSources =
      config.maxLangSources ?? Number(process.env.PIKASHOW_MAX_LANGS ?? 4)

    const fromEnv = process.env.PIKASHOW_PREFERRED_LANGS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    this.preferredLangs = (
      config.preferredLangs ??
      fromEnv ?? ['English', 'Hindi']
    ).map((s) => s.trim())

    this.deviceUuid = crypto.randomUUID()
    this.gaid = crypto.randomUUID()

    this.HEADERS = {
      Accept: 'application/json',
      'User-Agent': APP_UA.replace('{gaid}', this.gaid).replace(
        '{uuid}',
        this.deviceUuid,
      ),
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
      const json = await this.fetchJson<{ records?: unknown[] }>(
        `${this.BASE_URL}/v1/api/videos?type=hollywood&channel=pikashow`,
        false,
      )
      return Array.isArray(json?.records)
    } catch {
      return false
    }
  }

  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching Pikashow sources', media)

    const title = typeof media.title === 'string' ? media.title.trim() : ''
    if (!title) return this.emptyResult('Missing title for Pikashow search')

    const year = extractYear(media)
    const isTv = media.type === 'tv'

    if (isTv && (media.s == null || media.e == null)) {
      return this.emptyResult('TV requests require season (s) and episode (e)')
    }

    try {
      const hit = await this.resolveCatalog(title, year, isTv ? 'series' : 'movie')
      if (!hit) {
        return this.emptyResult(
          `No Pikashow catalog match for "${title}"${year ? ` (${year})` : ''}`,
        )
      }

      const video = await this.fetchVideo(hit, media)
      if (!video) return this.emptyResult('Pikashow video API returned no data')

      const sources = this.mapVideoSources(video, hit)
      if (!sources.length) return this.emptyResult('No playable Pikashow HLS URLs')

      return { sources, subtitles: [], diagnostics: [] }
    } catch (error) {
      return this.emptyResult(error instanceof Error ? error.message : 'Unknown provider error')
    }
  }

  private async resolveCatalog(
    title: string,
    year: string | null,
    kind: 'movie' | 'series',
  ): Promise<CatalogHit | null> {
    if (kind === 'series') {
      const series = await this.fetchSeriesList()
      const match = pickBestSeries(series, title, year)
      return match ? { kind: 'series', type: 'series', record: match } : null
    }

    const [hollywood, bollywood] = await Promise.all([
      this.fetchMovieList('hollywood'),
      this.fetchMovieList('bollywood'),
    ])
    const hollywoodHit = pickBestMovie(hollywood, title, year)
    if (hollywoodHit) {
      return { kind: 'movie', type: 'hollywood', record: hollywoodHit }
    }
    const bollywoodHit = pickBestMovie(bollywood, title, year)
    return bollywoodHit
      ? { kind: 'movie', type: 'bollywood', record: bollywoodHit }
      : null
  }

  private async fetchMovieList(
    type: 'hollywood' | 'bollywood',
  ): Promise<MovieRecord[]> {
    const json = await this.fetchJson<{ records?: MovieRecord[] }>(
      `${this.BASE_URL}/v1/api/videos?type=${type}&channel=pikashow`,
      false,
    )
    return Array.isArray(json?.records) ? json.records : []
  }

  private async fetchSeriesList(): Promise<SeriesRecord[]> {
    const json = await this.fetchJson<{ series?: SeriesRecord[] }>(
      `${this.BASE_URL}/v1/api/videos?type=series&channel=pikashow`,
      false,
    )
    return Array.isArray(json?.series) ? json.series : []
  }

  private async fetchVideo(
    hit: CatalogHit,
    media: ProviderMediaObject,
  ): Promise<VideoData | null> {
    const params = new URLSearchParams()
    if (hit.kind === 'movie') {
      params.set('type', hit.type)
      params.set('videoId', String(hit.record.so ?? 0))
      params.set('title', hit.record.t || '')
      params.set('noseasons', '1')
      params.set('noepisodes', '0')
    } else {
      params.set('type', 'series')
      params.set('videoId', '0')
      params.set('title', hit.record.t || '')
      params.set('noseasons', String(media.s ?? 1))
      params.set('noepisodes', String(media.e ?? 1))
    }

    const json = await this.fetchJson<VideoApiResponse>(
      `${this.BASE_URL}/v1/api/video?${params}`,
      true,
    )
    if (!json?.data) return null

    if (hit.kind === 'series') {
      return extractEpisodeVideo(json.data, Number(media.s), Number(media.e)) || json.data
    }
    return json.data
  }

  private mapVideoSources(video: VideoData, hit: CatalogHit): Source[] {
    const streamHeaders = buildStreamHeaders(video)
    const candidates = collectHlsCandidates(video)
    const ordered = orderByPreferredLang(candidates, this.preferredLangs).slice(
      0,
      this.maxLangSources,
    )

    const seen = new Set<string>()
    const sources: Source[] = []
    for (const row of ordered) {
      if (!row.url || seen.has(row.url)) continue
      seen.add(row.url)
      sources.push({
        url: this.createProxyUrl(row.url, streamHeaders),
        type: 'hls',
        quality: row.quality || 'Auto',
        audioTracks: [{ label: row.language || 'Default', language: langCode(row.language) }],
        provider: {
          id: this.id,
          name: `${this.name}/${row.language || hit.type}`,
        },
      })
    }
    return sources
  }

  private authHeaders(): Record<string, string> {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(`${this.apiKey}:${timestamp}`)
      .digest('hex')
    return {
      'X-API-Key': this.apiKey,
      'X-Signature': signature,
      'X-Timestamp': timestamp,
    }
  }

  private async fetchJson<T>(url: string, signed: boolean): Promise<T | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, {
        headers: {
          ...this.HEADERS,
          ...(signed ? this.authHeaders() : {}),
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

export function generatePikashowSignature(
  apiKey: string,
  hmacSecret: string,
  timestampSeconds: number,
): string {
  return crypto
    .createHmac('sha256', hmacSecret)
    .update(`${apiKey}:${timestampSeconds}`)
    .digest('hex')
}

export function normalizePikashowTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(dual|hybrid|imax|extended|remastered|uncut|hindi|tamil|telugu|english)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function scoreTitleMatch(candidate: string, want: string): number {
  const a = normalizePikashowTitle(candidate)
  const b = normalizePikashowTitle(want)
  if (!a || !b) return 99
  if (a === b) return 0
  if (a.startsWith(b) || b.startsWith(a)) return 1
  if (a.includes(b) || b.includes(a)) return 2
  // token overlap
  const at = new Set(a.split(' ').filter(Boolean))
  const bt = b.split(' ').filter(Boolean)
  const hit = bt.filter((t) => at.has(t)).length
  if (hit >= Math.max(1, Math.ceil(bt.length * 0.7))) return 3
  return 99
}

function pickBestMovie(
  records: MovieRecord[],
  title: string,
  year: string | null,
): MovieRecord | null {
  const scored = records
    .map((r) => ({
      r,
      score: scoreTitleMatch(r.t || '', title),
      yearPenalty: year && r.y && String(r.y) !== year ? 10 : 0,
    }))
    .filter((x) => x.score < 99)
    .sort((a, b) => a.score + a.yearPenalty - (b.score + b.yearPenalty))
  return scored[0]?.r ?? null
}

function pickBestSeries(
  records: SeriesRecord[],
  title: string,
  year: string | null,
): SeriesRecord | null {
  const scored = records
    .map((r) => ({
      r,
      score: scoreTitleMatch(r.t || '', title),
      yearPenalty: year && r.y && Math.abs(Number(r.y) - Number(year)) > 2 ? 10 : 0,
    }))
    .filter((x) => x.score < 99)
    .sort((a, b) => a.score + a.yearPenalty - (b.score + b.yearPenalty))
  return scored[0]?.r ?? null
}

function extractEpisodeVideo(
  data: VideoData,
  season: number,
  episode: number,
): VideoData | null {
  const details = Array.isArray(data.detail) ? data.detail : []
  for (const d of details) {
    if (Number(d.season) !== season) continue
    const eps = Array.isArray(d.episodes) ? d.episodes : []
    const ep = eps.find((e) => Number(e.e) === episode)
    if (!ep) continue
    return {
      ...data,
      playUrl: ep.playUrl || data.playUrl,
      resolutions: ep.resolutions || data.resolutions,
      languages: ep.languages || data.languages,
      languageOptions: ep.languageOptions || data.languageOptions,
      headers: ep.headers || data.headers,
      uaStr: ep.uaStr || data.uaStr,
      headerStr: ep.headerStr || data.headerStr,
      host: ep.host || data.host,
      sourceType: ep.sourceType || data.sourceType,
      url: ep.url || data.url,
    }
  }
  return null
}

type HlsCandidate = { url: string; language: string; quality: string }

function collectHlsCandidates(video: VideoData): HlsCandidate[] {
  const out: HlsCandidate[] = []
  const langs = video.languageOptions || video.languages || []

  for (const lang of langs) {
    const language = lang.language || 'Default'
    if (lang.playUrl && isHls(lang.playUrl)) {
      out.push({ url: lang.playUrl, language, quality: 'Auto' })
      continue
    }
    const best = pickBestResolution(lang.resolutions || [])
    if (best?.url) out.push({ url: best.url, language, quality: best.label || 'Auto' })
  }

  if (!out.length && video.playUrl && isHls(video.playUrl)) {
    out.push({ url: video.playUrl, language: 'Default', quality: 'Auto' })
  }
  if (!out.length) {
    const best = pickBestResolution(video.resolutions || [])
    if (best?.url) out.push({ url: best.url, language: 'Default', quality: best.label || 'Auto' })
  }
  return out
}

function pickBestResolution(rows: Resolution[]): Resolution | null {
  if (!rows.length) return null
  const rank = (label?: string) => {
    const l = (label || '').toLowerCase()
    if (l.includes('1080')) return 4
    if (l.includes('720')) return 3
    if (l.includes('480')) return 2
    if (l.includes('360')) return 1
    return 0
  }
  return [...rows].sort((a, b) => rank(b.label) - rank(a.label))[0] || null
}

function orderByPreferredLang(
  rows: HlsCandidate[],
  preferred: string[],
): HlsCandidate[] {
  const pref = preferred.map((p) => p.toLowerCase())
  return [...rows].sort((a, b) => {
    const ai = pref.indexOf(a.language.toLowerCase())
    const bi = pref.indexOf(b.language.toLowerCase())
    const as = ai === -1 ? 100 : ai
    const bs = bi === -1 ? 100 : bi
    return as - bs
  })
}

function buildStreamHeaders(video: VideoData): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: '*/*',
    'User-Agent':
      video.uaStr ||
      video.uastr ||
      'Mozilla/5.0 (iPhone; CPU iPhone OS 13_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1',
  }

  const originHost = video.host
    ? `https://${video.host.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
    : 'https://samui390dod.com'
  headers.Referer = `${originHost}/`
  headers.Origin = originHost

  if (video.headers) Object.assign(headers, video.headers)
  if (video.heastr) headers.heastr = video.heastr

  if (video.headerStr) {
    try {
      const parsed = JSON.parse(video.headerStr) as Record<string, string>
      Object.assign(headers, parsed)
    } catch {
      /* ignore */
    }
  }

  return headers
}

function isHls(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || url.includes('m3u8')
}

function extractYear(media: ProviderMediaObject): string | null {
  const y = (media as { year?: string | number }).year
  if (y == null || y === '') return null
  const s = String(y).trim()
  return /^\d{4}$/.test(s) ? s : null
}

function langCode(label?: string): string {
  const l = (label || '').toLowerCase()
  if (l.startsWith('en')) return 'en'
  if (l.startsWith('hi')) return 'hi'
  if (l.startsWith('ta')) return 'ta'
  if (l.startsWith('te')) return 'te'
  return 'und'
}

export function createOmssProviders(
  config: PikashowPluginConfig = {},
): BaseProvider[] {
  return [new PikashowProvider(config)]
}
