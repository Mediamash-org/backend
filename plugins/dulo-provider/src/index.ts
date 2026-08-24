import { BaseProvider } from '@omss/framework'
import type {
  Diagnostic,
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
  Subtitle,
} from '@omss/framework'

export interface DuloPluginConfig {
  id?: string
  name?: string
  baseUrl?: string
  /** Max HLS sources to return (API may list several providers) */
  maxStreams?: number
  timeoutMs?: number
}

type DuloSource = {
  url?: string
  quality?: string
  label?: string
  name?: string
  language?: string
  type?: string
  headers?: Record<string, string>
}

type DuloSubtitle = {
  url?: string
  label?: string
  lang?: string
  language?: string
  format?: string
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/**
 * OMSS provider for [Dulo](https://dulo.cx/) (also dulo.gd).
 *
 * Flow:
 * 1. `GET /api/session` → `__Host-amri_session` cookie
 * 2. `POST /api/source` with `{ type, tmdbId, season?, episode? }` (`Accept: text/event-stream`)
 * 3. Parse SSE `sources` / `error` events → proxy HLS URLs
 */
export class DuloProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly maxStreams: number
  private readonly timeoutMs: number

  constructor(config: DuloPluginConfig = {}) {
    super()
    this.id = config.id ?? 'dulo'
    this.name = config.name ?? 'Dulo'
    this.BASE_URL = (
      config.baseUrl ??
      process.env.DULO_BASE_URL ??
      'https://dulo.cx'
    ).replace(/\/$/, '')
    this.maxStreams =
      config.maxStreams ?? Number(process.env.DULO_MAX_STREAMS ?? 4)
    this.timeoutMs =
      config.timeoutMs ?? Number(process.env.DULO_TIMEOUT_MS ?? 35_000)

    this.HEADERS = {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, text/event-stream, */*',
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
      const session = await this.openSession()
      return session.ok
    } catch {
      return false
    }
  }

  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching Dulo sources', media)

    const tmdbId = String(media.tmdbId || '').trim()
    if (!tmdbId) {
      return this.emptyResult('Missing tmdbId')
    }

    const mediaType = media.type === 'tv' ? 'tv' : 'movie'
    if (mediaType === 'tv' && (media.s == null || media.e == null)) {
      return this.emptyResult('TV requests require season (s) and episode (e)')
    }

    try {
      const session = await this.openSession()
      if (!session.ok || !session.cookie) {
        return this.emptyResult(session.error ?? 'Session failed')
      }

      const body: Record<string, string | number> = {
        type: mediaType,
        tmdbId: Number(tmdbId) || tmdbId,
      }
      if (mediaType === 'tv') {
        body.season = Number(media.s)
        body.episode = Number(media.e)
      }

      const { sources: rawSources, subtitles: rawSubs, error } =
        await this.fetchSources(session.cookie, body)

      if (error) {
        return this.emptyResult(error)
      }

      const diagnostics: Diagnostic[] = []
      const sources: Source[] = []
      const seen = new Set<string>()

      for (const raw of rawSources) {
        if (sources.length >= this.maxStreams) break
        const mapped = this.mapSource(raw)
        if (!mapped) continue
        if (seen.has(mapped.url)) continue
        seen.add(mapped.url)
        sources.push(mapped)
      }

      const subtitles = rawSubs
        .map((s) => this.mapSubtitle(s))
        .filter((s): s is Subtitle => s !== null)

      if (!sources.length) {
        return {
          sources: [],
          subtitles,
          diagnostics: [
            {
              code: 'PROVIDER_ERROR',
              message: `${this.name}: No playable sources`,
              field: '',
              severity: 'error',
            },
          ],
        }
      }

      return { sources, subtitles, diagnostics }
    } catch (error) {
      return this.emptyResult(
        error instanceof Error ? error.message : 'Unknown provider error',
      )
    }
  }

  private async openSession(): Promise<{
    ok: boolean
    cookie?: string
    error?: string
  }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.BASE_URL}/api/session`, {
        headers: this.HEADERS,
        signal: controller.signal,
      })

      if (response.status === 403) {
        return {
          ok: false,
          error: 'Session blocked (turnstile/challenge required)',
        }
      }
      if (!response.ok) {
        return { ok: false, error: `Session HTTP ${response.status}` }
      }

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean
        error?: string
      } | null

      if (payload?.error === 'turnstile_required') {
        return {
          ok: false,
          error: 'Session requires Cloudflare Turnstile',
        }
      }
      if (payload && payload.ok === false) {
        return {
          ok: false,
          error: payload.error ?? 'Session rejected',
        }
      }

      const cookie = this.extractSessionCookie(response)
      if (!cookie) {
        return { ok: false, error: 'Missing session cookie' }
      }

      return { ok: true, cookie }
    } finally {
      clearTimeout(timer)
    }
  }

  private extractSessionCookie(response: Response): string | undefined {
    const headers = response.headers as Headers & {
      getSetCookie?: () => string[]
    }
    const lines =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : (() => {
            const single = response.headers.get('set-cookie')
            return single ? [single] : []
          })()

    for (const line of lines) {
      const match = line.match(/(__Host-amri_session=[^;]+)/i)
      if (match) return match[1]
    }
    return undefined
  }

  private async fetchSources(
    cookie: string,
    body: Record<string, string | number>,
  ): Promise<{
    sources: DuloSource[]
    subtitles: DuloSubtitle[]
    error?: string
  }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.BASE_URL}/api/source`, {
        method: 'POST',
        headers: {
          ...this.HEADERS,
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (response.status === 403) {
        return {
          sources: [],
          subtitles: [],
          error: 'Source request forbidden (session expired or blocked)',
        }
      }
      if (!response.ok) {
        const errBody = await response.json().catch(() => null)
        const message =
          errBody && typeof errBody === 'object' && 'error' in errBody
            ? String((errBody as { error: unknown }).error)
            : `HTTP ${response.status}`
        return { sources: [], subtitles: [], error: message }
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase()
      const text = await response.text()

      if (
        contentType.includes('application/json') ||
        text.trimStart().startsWith('{')
      ) {
        return this.parseJsonSources(text)
      }

      return this.parseSseSources(text)
    } finally {
      clearTimeout(timer)
    }
  }

  private parseJsonSources(text: string): {
    sources: DuloSource[]
    subtitles: DuloSubtitle[]
    error?: string
  } {
    try {
      const payload = JSON.parse(text) as {
        error?: string
        sources?: DuloSource[]
        subtitles?: DuloSubtitle[]
      }
      if (payload.error) {
        return { sources: [], subtitles: [], error: String(payload.error) }
      }
      return {
        sources: Array.isArray(payload.sources) ? payload.sources : [],
        subtitles: Array.isArray(payload.subtitles) ? payload.subtitles : [],
      }
    } catch {
      return { sources: [], subtitles: [], error: 'Invalid JSON source payload' }
    }
  }

  private parseSseSources(text: string): {
    sources: DuloSource[]
    subtitles: DuloSubtitle[]
    error?: string
  } {
    const sources: DuloSource[] = []
    const subtitles: DuloSubtitle[] = []
    let error: string | undefined

    for (const block of text.split(/\n\n+/)) {
      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim())
        }
      }
      if (!dataLines.length) continue

      let data: unknown
      try {
        data = JSON.parse(dataLines.join('\n'))
      } catch {
        continue
      }

      if (eventName === 'error' && data && typeof data === 'object') {
        const row = data as { code?: string; error?: string; message?: string }
        error = row.code || row.error || row.message || 'upstream error'
        continue
      }

      if (eventName === 'sources' && data && typeof data === 'object') {
        const row = data as {
          sources?: DuloSource[]
          subtitles?: DuloSubtitle[]
        }
        if (Array.isArray(row.sources)) sources.push(...row.sources)
        if (Array.isArray(row.subtitles)) subtitles.push(...row.subtitles)
      }
    }

    if (error && !sources.length) {
      return { sources: [], subtitles, error }
    }
    return { sources, subtitles, error: sources.length ? undefined : error }
  }

  private mapSource(raw: DuloSource): Source | null {
    const file = typeof raw.url === 'string' ? raw.url.trim() : ''
    if (!file || !/^https?:\/\//i.test(file)) return null

    const rawType = (raw.type ?? '').toLowerCase()
    const type: 'hls' | 'mp4' | 'dash' =
      rawType.includes('dash') || file.includes('.mpd')
        ? 'dash'
        : rawType.includes('mp4') || /\.mp4(\?|$)/i.test(file)
          ? 'mp4'
          : 'hls'

    const streamHeaders = {
      ...this.HEADERS,
      ...(raw.headers ?? {}),
    }

    const quality = this.inferSourceQuality(
      raw.quality ?? raw.label ?? raw.name ?? file,
    )
    const audioLabel = raw.language || raw.label || 'Default'

    return {
      url: this.createProxyUrl(file, streamHeaders),
      type,
      quality,
      audioTracks: [{ label: audioLabel, language: this.guessLang(raw.language) }],
      provider: { id: this.id, name: this.name },
    }
  }

  private mapSubtitle(raw: DuloSubtitle): Subtitle | null {
    const file = typeof raw.url === 'string' ? raw.url.trim() : ''
    if (!file || !/^https?:\/\//i.test(file)) return null

    const formatHint = (raw.format ?? file).toLowerCase()
    return {
      url: this.createProxyUrl(file, this.HEADERS),
      label: raw.label ?? raw.lang ?? raw.language ?? 'Unknown',
      format: formatHint.includes('srt') ? 'srt' : 'vtt',
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

export function createOmssProviders(config: DuloPluginConfig = {}): BaseProvider[] {
  return [new DuloProvider(config)]
}
