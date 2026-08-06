import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
  Subtitle,
} from '@omss/framework'

export interface VideasyPluginConfig {
  id?: string
  name?: string
  apiBaseUrl?: string
  decryptUrl?: string
  timeoutMs?: number
  maxStreams?: number
  /** speedracelight path segments, e.g. cdn, m4uhd */
  servers?: string[]
}

type MediaMeta = {
  title: string
  year: string
  imdbId: string
  tmdbId: string
  type: 'movie' | 'tv'
  season: number
  episode: number
}

type DecryptedPayload = {
  sources?: Array<{ url?: string; quality?: string }>
  subtitles?: Array<{ url?: string; lang?: string; language?: string; label?: string }>
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'

const DEFAULT_SERVERS = ['cdn', 'm4uhd']

/**
 * OMSS provider for Videasy (`player.videasy.to`) using its encrypted
 * speedracelight backends + enc-dec.app decryption.
 */
export class VideasyProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly apiBaseUrl: string
  private readonly decryptUrl: string
  private readonly timeoutMs: number
  private readonly maxStreams: number
  private readonly servers: string[]
  private readonly tmdbApiKey: string

  constructor(config: VideasyPluginConfig = {}) {
    super()
    this.id = config.id ?? 'videasy'
    this.name = config.name ?? 'Videasy'
    this.BASE_URL = 'https://player.videasy.to'
    this.apiBaseUrl = (
      config.apiBaseUrl ??
      process.env.VIDEASY_API_BASE_URL ??
      'https://api.speedracelight.com'
    ).replace(/\/$/, '')
    this.decryptUrl = (
      config.decryptUrl ??
      process.env.VIDEASY_DECRYPT_URL ??
      'https://enc-dec.app/api/dec-videasy'
    ).replace(/\/$/, '')
    this.timeoutMs =
      config.timeoutMs ?? Number(process.env.VIDEASY_TIMEOUT_MS ?? 18_000)
    this.maxStreams =
      config.maxStreams ?? Number(process.env.VIDEASY_MAX_STREAMS ?? 4)
    this.servers = normalizeServers(
      config.servers ??
        process.env.VIDEASY_SERVERS?.split(',') ??
        DEFAULT_SERVERS,
    )
    this.tmdbApiKey = process.env.TMDB_API_KEY ?? ''

    this.HEADERS = {
      'User-Agent': DEFAULT_UA,
      Accept: '*/*',
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
      const response = await this.fetchText(
        `${this.apiBaseUrl}/seed?mediaId=27205`,
      )
      return Boolean(response && response.includes('seed'))
    } catch {
      return false
    }
  }

  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching Videasy sources', media)

    try {
      const meta = await this.resolveMeta(media)
      if (!meta) {
        return this.emptyResult(
          'Could not resolve title/year/TMDB metadata for Videasy',
        )
      }

      const seed = await this.fetchSeed(meta.tmdbId)
      if (!seed) return this.emptyResult('Failed to obtain Videasy seed')

      const settled = await Promise.all(
        this.servers.map(async (server) => {
          try {
            return {
              server,
              payload: await this.fetchServer(server, meta, seed),
            }
          } catch {
            return { server, payload: null }
          }
        }),
      )

      const streamHeaders = {
        Accept: '*/*',
        'User-Agent': DEFAULT_UA,
        Referer: `${this.BASE_URL}/`,
        Origin: this.BASE_URL,
      }

      const candidates: Array<{
        url: string
        quality: string
        server: string
        score: number
      }> = []
      const seen = new Set<string>()
      const subtitles: Subtitle[] = []
      const seenSubs = new Set<string>()

      for (const row of settled) {
        const payload = row.payload
        if (!payload) continue

        for (const source of payload.sources ?? []) {
          const url = String(source.url || '').trim()
          if (!url || seen.has(url)) continue
          seen.add(url)
          const quality = String(source.quality || 'Auto').trim() || 'Auto'
          candidates.push({
            url,
            quality,
            server: row.server,
            score: qualityScore(quality),
          })
        }

        for (const sub of payload.subtitles ?? []) {
          const url = String(sub.url || '').trim()
          if (!url || seenSubs.has(url)) continue
          seenSubs.add(url)
          const label =
            String(sub.label || sub.language || sub.lang || 'Subtitle').trim() ||
            'Subtitle'
          const lower = url.toLowerCase()
          subtitles.push({
            url: this.createProxyUrl(url, streamHeaders),
            label,
            format: lower.includes('.srt') ? 'srt' : 'vtt',
          })
        }
      }

      candidates.sort((a, b) => b.score - a.score || a.server.localeCompare(b.server))
      const picked = candidates.slice(0, this.maxStreams)

      if (!picked.length) {
        return this.emptyResult('No streams returned after Videasy decrypt')
      }

      const sources: Source[] = picked.map((row) => ({
        url: this.createProxyUrl(row.url, streamHeaders),
        type: inferSourceType(row.url, row.quality),
        quality: row.quality,
        audioTracks: [{ label: 'Default', language: 'en' }],
        provider: {
          id: this.id,
          name: `${this.name}/${row.server}`,
        },
      }))

      const preferredSubs = [
        ...subtitles.filter((s) => /eng|english/i.test(s.label)),
        ...subtitles.filter((s) => !/eng|english/i.test(s.label)),
      ].slice(0, 12)

      return { sources, subtitles: preferredSubs, diagnostics: [] }
    } catch (error) {
      return this.emptyResult(
        error instanceof Error ? error.message : 'Unknown provider error',
      )
    }
  }

  private async resolveMeta(
    media: ProviderMediaObject,
  ): Promise<MediaMeta | null> {
    const tmdbId = String(media.tmdbId || '').trim()
    if (!/^\d+$/.test(tmdbId)) return null

    const type = media.type === 'tv' ? 'tv' : 'movie'
    const season = media.s ?? 1
    const episode = media.e ?? 1

    let title = typeof media.title === 'string' ? media.title.trim() : ''
    let year = extractYear(media) || ''
    let imdbId = String(
      (media as ProviderMediaObject & { imdbId?: string }).imdbId || '',
    ).trim()

    const needsLookup = !title || !year || !/^tt\d+$/i.test(imdbId)
    if (needsLookup && this.tmdbApiKey) {
      const json = await this.fetchJson<{
        title?: string
        name?: string
        release_date?: string
        first_air_date?: string
        external_ids?: { imdb_id?: string | null }
        imdb_id?: string | null
      }>(
        `https://api.themoviedb.org/3/${type}/${encodeURIComponent(tmdbId)}` +
          `?api_key=${encodeURIComponent(this.tmdbApiKey)}` +
          `&append_to_response=external_ids`,
      )
      if (json) {
        title = title || String(json.title || json.name || '').trim()
        if (!year) {
          const date = String(json.release_date || json.first_air_date || '')
          year = date.slice(0, 4)
        }
        if (!/^tt\d+$/i.test(imdbId)) {
          imdbId = String(
            json.external_ids?.imdb_id || json.imdb_id || '',
          ).trim()
        }
      }
    }

    if (!title || !/^\d{4}$/.test(year)) return null

    return {
      title,
      year,
      imdbId: /^tt\d+$/i.test(imdbId) ? imdbId.toLowerCase() : '',
      tmdbId,
      type,
      season,
      episode,
    }
  }

  private async fetchSeed(tmdbId: string): Promise<string | null> {
    const text = await this.fetchText(`${this.apiBaseUrl}/seed?mediaId=${tmdbId}`)
    if (!text) return null
    try {
      const json = JSON.parse(text) as { seed?: string }
      const seed = String(json.seed || '').trim()
      return seed || null
    } catch {
      return null
    }
  }

  private async fetchServer(
    server: string,
    meta: MediaMeta,
    seed: string,
  ): Promise<DecryptedPayload | null> {
    const qs = new URLSearchParams({
      title: encodeURIComponent(meta.title),
      mediaType: meta.type,
      year: meta.year,
      episodeId: String(meta.episode),
      seasonId: String(meta.season),
      tmdbId: meta.tmdbId,
      imdbId: meta.imdbId || 'tt0000000',
      enc: '2',
      seed,
    })

    const encText = await this.fetchText(
      `${this.apiBaseUrl}/${server}/sources-with-title?${qs.toString()}`,
    )
    if (!encText || encText.length < 20 || encText.trim().startsWith('{')) {
      return null
    }

    const decrypted = await this.decrypt(encText, meta.tmdbId, seed)
    if (!decrypted?.sources?.length) return null
    return decrypted
  }

  private async decrypt(
    text: string,
    tmdbId: string,
    seed: string,
  ): Promise<DecryptedPayload | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(this.decryptUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': DEFAULT_UA,
        },
        body: JSON.stringify({ text, id: String(tmdbId), seed }),
        signal: controller.signal,
      })
      if (!response.ok) return null
      const json = (await response.json()) as {
        status?: number
        result?: DecryptedPayload
      }
      if (json.status !== 200 || !json.result) return null
      return json.result
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  private async fetchText(url: string): Promise<string | null> {
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
    const text = await this.fetchText(url)
    if (!text) return null
    try {
      return JSON.parse(text) as T
    } catch {
      return null
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

function normalizeServers(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
}

function extractYear(media: ProviderMediaObject): string | null {
  const y = (media as { year?: string | number }).year
  if (y == null || y === '') return null
  const s = String(y).trim()
  return /^\d{4}$/.test(s) ? s : null
}

function qualityScore(quality: string): number {
  const q = quality.toLowerCase()
  if (/2160|4k|uhd/.test(q)) return 400
  if (/1080|fhd/.test(q)) return 300
  if (/playhq|auto/.test(q)) return 250
  if (/720/.test(q)) return 200
  if (/480|360|sd/.test(q)) return 100
  return 150
}

function inferSourceType(url: string, quality: string): 'hls' | 'mp4' {
  const lower = `${url} ${quality}`.toLowerCase()
  if (lower.includes('.m3u8') || lower.includes('mpegurl') || /playhq/i.test(quality)) {
    return 'hls'
  }
  if (lower.includes('.mp4')) return 'mp4'
  return lower.includes('mp4/') ? 'mp4' : 'hls'
}

export function createOmssProviders(
  config: VideasyPluginConfig = {},
): BaseProvider[] {
  return [new VideasyProvider(config)]
}
