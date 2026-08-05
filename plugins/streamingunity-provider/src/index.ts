import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
} from '@omss/framework'

export interface StreamingUnityPluginConfig {
  id?: string
  name?: string
  baseUrl?: string
  locale?: string
  /** Max search candidates to open for TMDB matching */
  maxSearchCandidates?: number
  timeoutMs?: number
}

type SearchHit = {
  id: number
  slug: string
  name: string
  type: string
}

type TitleMeta = {
  id: number
  slug: string
  name: string
  type: string
  tmdb_id?: number | string | null
  imdb_id?: string | null
  scws_id?: number | string | null
}

type EpisodeMeta = {
  id: number
  number: number
  name?: string
  scws_id?: number | string | null
}

type VixStream = { name?: string; active?: boolean | number; url?: string }

type VixMaster = {
  url: string
  token: string
  expires: string
  streams: VixStream[]
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/**
 * OMSS provider for [StreamingUnity](https://streamingunity.vip/).
 *
 * Catalog search → title/season pages → iframe → VixCloud playlist (+ token).
 */
export class StreamingUnityProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly locale: string
  private readonly maxSearchCandidates: number
  private readonly timeoutMs: number

  constructor(config: StreamingUnityPluginConfig = {}) {
    super()
    this.id = config.id ?? 'streamingunity'
    this.name = config.name ?? 'StreamingUnity'
    this.BASE_URL = (
      config.baseUrl ??
      process.env.STREAMINGUNITY_BASE_URL ??
      'https://streamingunity.vip'
    ).replace(/\/$/, '')
    this.locale = (
      config.locale ??
      process.env.STREAMINGUNITY_LOCALE ??
      'en'
    ).toLowerCase()
    this.maxSearchCandidates =
      config.maxSearchCandidates ??
      Number(process.env.STREAMINGUNITY_MAX_SEARCH ?? 8)
    this.timeoutMs =
      config.timeoutMs ?? Number(process.env.STREAMINGUNITY_TIMEOUT_MS ?? 20_000)

    this.HEADERS = {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/json,application/xhtml+xml,*/*;q=0.8',
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
      const response = await this.fetchText(`${this.BASE_URL}/${this.locale}`)
      return Boolean(response)
    } catch {
      return false
    }
  }

  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching StreamingUnity sources', media)

    const tmdbId = String(media.tmdbId || '').trim()
    if (!tmdbId) return this.emptyResult('Missing tmdbId')

    const mediaType = media.type === 'tv' ? 'tv' : 'movie'
    if (mediaType === 'tv' && (media.s == null || media.e == null)) {
      return this.emptyResult('TV requests require season (s) and episode (e)')
    }

    try {
      const query = this.buildSearchQuery(media)
      if (!query) return this.emptyResult('Missing title for search')

      const title = await this.resolveTitle(query, tmdbId, mediaType)
      if (!title) {
        return this.emptyResult(`No title matched TMDB ${tmdbId} for query "${query}"`)
      }

      let iframePath = `/${this.locale}/iframe/${title.id}`
      if (mediaType === 'tv') {
        const episode = await this.resolveEpisode(title, Number(media.s), Number(media.e))
        if (!episode) {
          return this.emptyResult(
            `No episode S${media.s}E${media.e} on title ${title.id}`,
          )
        }
        iframePath += `?episode_id=${episode.id}`
      }

      const iframeHtml = await this.fetchText(`${this.BASE_URL}${iframePath}`)
      if (!iframeHtml) return this.emptyResult('Failed to fetch iframe page')

      const embedUrl = extractVixEmbedUrl(iframeHtml)
      if (!embedUrl) return this.emptyResult('No VixCloud embed URL on iframe page')

      const embedHtml = await this.fetchText(embedUrl, {
        Referer: `${this.BASE_URL}/`,
        Origin: this.BASE_URL,
      })
      if (!embedHtml) return this.emptyResult('Failed to fetch VixCloud embed')

      const master = parseVixMasterPlaylist(embedHtml)
      if (!master) return this.emptyResult('No masterPlaylist token/url in VixCloud embed')

      const streamHeaders = {
        'User-Agent': DEFAULT_UA,
        Accept: '*/*',
        Referer: 'https://vixcloud.co/',
        Origin: 'https://vixcloud.co',
      }

      const sources = this.mapVixSources(master, streamHeaders)
      if (!sources.length) return this.emptyResult('No usable VixCloud playlist URLs')

      return { sources, subtitles: [], diagnostics: [] }
    } catch (error) {
      return this.emptyResult(error instanceof Error ? error.message : 'Unknown provider error')
    }
  }

  private buildSearchQuery(media: ProviderMediaObject): string {
    const title = typeof media.title === 'string' ? media.title.trim() : ''
    if (title) return title
    // Fallback: IMDb id sometimes works poorly; prefer empty → error
    return ''
  }

  private async resolveTitle(
    query: string,
    tmdbId: string,
    mediaType: 'movie' | 'tv',
  ): Promise<TitleMeta | null> {
    const hits = await this.search(query)
    const typed = hits.filter((h) => h.type === mediaType)
    const candidates = (typed.length ? typed : hits).slice(0, this.maxSearchCandidates)

    for (const hit of candidates) {
      const meta = await this.fetchTitleMeta(hit.id, hit.slug)
      if (!meta) continue
      if (String(meta.tmdb_id ?? '') === tmdbId) return meta
    }

    return null
  }

  private async search(query: string): Promise<SearchHit[]> {
    const url = `${this.BASE_URL}/${this.locale}/search?q=${encodeURIComponent(query)}`
    const json = await this.fetchJson<{ data?: SearchHit[] }>(url, {
      Accept: 'application/json',
    })
    return Array.isArray(json?.data) ? json.data : []
  }

  private async fetchTitleMeta(id: number, slug: string): Promise<TitleMeta | null> {
    const html = await this.fetchText(`${this.BASE_URL}/${this.locale}/titles/${id}-${slug}`)
    if (!html) return null
    const page = parseInertiaPage(html)
    const title = page?.props?.title as TitleMeta | undefined
    if (!title?.id) return null
    return {
      id: Number(title.id),
      slug: String(title.slug ?? slug),
      name: String(title.name ?? ''),
      type: String(title.type ?? ''),
      tmdb_id: title.tmdb_id ?? null,
      imdb_id: title.imdb_id ?? null,
      scws_id: title.scws_id ?? null,
    }
  }

  private async resolveEpisode(
    title: TitleMeta,
    season: number,
    episode: number,
  ): Promise<EpisodeMeta | null> {
    const html = await this.fetchText(
      `${this.BASE_URL}/${this.locale}/titles/${title.id}-${title.slug}/season-${season}`,
    )
    if (!html) return null
    const page = parseInertiaPage(html)
    const loaded = page?.props?.loadedSeason as { episodes?: EpisodeMeta[] } | undefined
    const episodes = Array.isArray(loaded?.episodes) ? loaded.episodes : []
    const match = episodes.find((e) => Number(e.number) === episode)
    return match
      ? {
          id: Number(match.id),
          number: Number(match.number),
          name: match.name,
          scws_id: match.scws_id ?? null,
        }
      : null
  }

  private mapVixSources(
    master: VixMaster,
    streamHeaders: Record<string, string>,
  ): Source[] {
    const urls: Array<{ label: string; url: string }> = []

    const primary = withAuthParams(master.url, master.token, master.expires)
    urls.push({ label: 'VixCloud', url: primary })

    for (const stream of master.streams) {
      if (!stream.url) continue
      const absolute = stream.url.startsWith('http')
        ? stream.url
        : new URL(stream.url, 'https://vixcloud.co/').href
      const authed = withAuthParams(absolute, master.token, master.expires)
      if (authed === primary) continue
      urls.push({ label: stream.name || 'VixCloud', url: authed })
    }

    const seen = new Set<string>()
    const sources: Source[] = []
    for (const row of urls) {
      if (seen.has(row.url)) continue
      seen.add(row.url)
      sources.push({
        url: this.createProxyUrl(row.url, streamHeaders),
        type: 'hls',
        quality: 'Auto',
        audioTracks: [{ label: 'Default', language: 'und' }],
        provider: { id: this.id, name: `${this.name}/${row.label}` },
      })
    }
    return sources
  }

  private async fetchText(
    url: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<string | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, {
        headers: { ...this.HEADERS, ...extraHeaders },
        signal: controller.signal,
        redirect: 'follow',
      })
      if (!response.ok) return null
      return await response.text()
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  private async fetchJson<T>(
    url: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<T | null> {
    const text = await this.fetchText(url, extraHeaders)
    if (!text) return null
    try {
      return JSON.parse(text) as T
    } catch {
      return null
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

export function parseInertiaPage(html: string): {
  component?: string
  props?: Record<string, unknown>
} | null {
  const match = html.match(/data-page="([^"]+)"/)
  if (!match) return null
  try {
    return JSON.parse(
      match[1]
        .replaceAll('&quot;', '"')
        .replaceAll('&amp;', '&')
        .replaceAll('&#039;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>'),
    ) as { component?: string; props?: Record<string, unknown> }
  } catch {
    return null
  }
}

export function extractVixEmbedUrl(iframeHtml: string): string | null {
  const match = iframeHtml.match(/src="(https:\/\/vixcloud\.co\/embed\/[^"]+)"/i)
  return match?.[1]?.replaceAll('&amp;', '&') ?? null
}

/** Parse window.masterPlaylist (+ optional window.streams) from VixCloud embed HTML. */
export function parseVixMasterPlaylist(embedHtml: string): VixMaster | null {
  const token =
    embedHtml.match(/window\.masterPlaylist\s*=\s*\{[\s\S]*?['"]token['"]\s*:\s*['"]([^'"]+)['"]/)?.[1] ??
    embedHtml.match(/['"]token['"]\s*:\s*['"]([a-f0-9]{16,})['"]/i)?.[1]
  const expires =
    embedHtml.match(/window\.masterPlaylist\s*=\s*\{[\s\S]*?['"]expires['"]\s*:\s*['"]([^'"]+)['"]/)?.[1] ??
    embedHtml.match(/['"]expires['"]\s*:\s*['"](\d+)['"]/)?.[1]
  const url =
    embedHtml.match(/window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*['"](https?:\/\/[^'"]+)['"]/)?.[1] ??
    embedHtml.match(/url:\s*['"](https:\/\/vixcloud\.co\/playlist\/[^'"]+)['"]/)?.[1]

  if (!token || !expires || !url) return null

  let streams: VixStream[] = []
  const streamsMatch = embedHtml.match(/window\.streams\s*=\s*(\[[\s\S]*?\]);/)
  if (streamsMatch?.[1]) {
    try {
      streams = JSON.parse(streamsMatch[1]) as VixStream[]
    } catch {
      streams = []
    }
  }

  return { url, token, expires, streams }
}

export function withAuthParams(url: string, token: string, expires: string): string {
  const u = new URL(url)
  u.searchParams.set('token', token)
  u.searchParams.set('expires', expires)
  return u.toString()
}

export function createOmssProviders(
  config: StreamingUnityPluginConfig = {},
): BaseProvider[] {
  return [new StreamingUnityProvider(config)]
}
