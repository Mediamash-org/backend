import { BaseProvider } from '@omss/framework'
import type {
  Diagnostic,
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
  Subtitle,
} from '@omss/framework'

export interface Hdmovie2PluginConfig {
  id?: string
  name?: string
  baseUrl?: string
  maxStreams?: number
  timeoutMs?: number
  /** Prefer catalog hits whose titles mention Hindi / Bollywood */
  preferHindi?: boolean
}

type SearchHit = {
  title: string
  url: string
  score: number
}

type EmbedOption = {
  playUrl: string
  label: string
  episode: number | null
}

type ResolvedStream = {
  playlistUrl: string
  title: string
  tracks: Array<{ file: string; label: string }>
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/**
 * OMSS provider for [HDMovie2](https://newhdmovie2.beer/).
 *
 * Catalog is title-search based (no TMDB ids). Streams resolve through
 * `hdm2.ink` JWT playlists to HLS.
 */
export class Hdmovie2Provider extends BaseProvider {
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
  private readonly preferHindi: boolean

  constructor(config: Hdmovie2PluginConfig = {}) {
    super()
    this.id = config.id ?? 'hdmovie2'
    this.name = config.name ?? 'HDMovie2'
    this.BASE_URL = (
      config.baseUrl ??
      process.env.HDMOVIE2_BASE_URL ??
      'https://newhdmovie2.beer'
    ).replace(/\/$/, '')
    this.maxStreams =
      config.maxStreams ?? Number(process.env.HDMOVIE2_MAX_STREAMS ?? 3)
    this.timeoutMs =
      config.timeoutMs ?? Number(process.env.HDMOVIE2_TIMEOUT_MS ?? 25_000)
    this.preferHindi =
      config.preferHindi ??
      !['0', 'false', 'no'].includes(
        String(process.env.HDMOVIE2_PREFER_HINDI ?? 'true').toLowerCase(),
      )

    this.HEADERS = {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
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
      const html = await this.fetchText(`${this.BASE_URL}/`)
      return Boolean(html && /hdmovie2/i.test(html))
    } catch {
      return false
    }
  }

  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching HDMovie2 sources', media)

    const title = typeof media.title === 'string' ? media.title.trim() : ''
    if (!title) return this.emptyResult('Missing title for HDMovie2 search')

    const year = extractYear(media)
    const mediaType = media.type === 'tv' ? 'tv' : 'movie'
    if (mediaType === 'tv' && (media.s == null || media.e == null)) {
      return this.emptyResult('TV requests require season (s) and episode (e)')
    }

    try {
      const queries = buildSearchQueries(title, mediaType, media.s, year)
      let hit: SearchHit | null = null
      for (const q of queries) {
        hit = await this.searchBest(q, title, year, mediaType, media.s)
        if (hit) break
      }
      if (!hit) {
        return this.emptyResult(
          `No HDMovie2 match for "${title}"${year ? ` (${year})` : ''}`,
        )
      }

      const pageHtml = await this.fetchText(hit.url)
      if (!pageHtml) return this.emptyResult('Failed to fetch title page')

      const embeds = extractEmbeds(pageHtml)
      if (!embeds.length) {
        return this.emptyResult(`No stream embeds on ${hit.url}`)
      }

      const selected =
        mediaType === 'tv'
          ? selectTvEmbeds(embeds, Number(media.e), this.maxStreams)
          : embeds.slice(0, this.maxStreams)

      if (!selected.length) {
        return this.emptyResult(
          mediaType === 'tv'
            ? `No embed for episode ${media.e} on season page`
            : 'No embeds after filtering',
        )
      }

      const sources: Source[] = []
      const subtitles: Subtitle[] = []
      const diagnostics: Diagnostic[] = []
      const seenPlaylists = new Set<string>()
      const seenSubs = new Set<string>()

      for (const embed of selected) {
        try {
          const resolved = await this.resolvePlayPage(embed.playUrl)
          if (!resolved) {
            diagnostics.push({
              code: 'PARTIAL_SCRAPE',
              message: `${this.name}: no playlist for ${embed.label}`,
              field: '',
              severity: 'warning',
            })
            continue
          }
          if (seenPlaylists.has(resolved.playlistUrl)) continue
          seenPlaylists.add(resolved.playlistUrl)

          const streamHeaders = {
            'User-Agent': DEFAULT_UA,
            Accept: '*/*',
            Referer: embed.playUrl,
            Origin: originOf(embed.playUrl) || 'https://hdm2.ink',
          }

          sources.push({
            url: this.createProxyUrl(resolved.playlistUrl, streamHeaders),
            type: 'hls',
            quality: '1080p',
            audioTracks: [
              {
                label: embed.label || 'Hindi',
                language: 'hin',
              },
            ],
            provider: {
              id: this.id,
              name: `${this.name}/${embed.label || 'Stream'}`,
            },
          })

          for (const track of resolved.tracks) {
            if (!track.file || seenSubs.has(track.file)) continue
            seenSubs.add(track.file)
            subtitles.push({
              url: this.createProxyUrl(track.file, streamHeaders),
              label: track.label || 'Unknown',
              format: track.file.toLowerCase().includes('.srt') ? 'srt' : 'vtt',
            })
          }
        } catch (error) {
          diagnostics.push({
            code: 'PARTIAL_SCRAPE',
            message: `${this.name}: ${
              error instanceof Error ? error.message : 'embed resolve failed'
            }`,
            field: '',
            severity: 'warning',
          })
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
                  message: `${this.name}: No playable HLS sources`,
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

  private async searchBest(
    query: string,
    wantTitle: string,
    year: string | null,
    mediaType: 'movie' | 'tv',
    season?: number,
  ): Promise<SearchHit | null> {
    const html = await this.fetchText(
      `${this.BASE_URL}/?s=${encodeURIComponent(query)}`,
    )
    if (!html) return null

    const hits = extractSearchHits(html, this.BASE_URL)
    if (!hits.length) return null

    const scored = hits
      .map((h) => ({
        ...h,
        score: scoreHit(h, wantTitle, year, mediaType, season, this.preferHindi),
      }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)

    return scored[0] ?? null
  }

  private async resolvePlayPage(playUrl: string): Promise<ResolvedStream | null> {
    const html = await this.fetchText(playUrl, {
      Referer: `${this.BASE_URL}/`,
    })
    if (!html) return null

    const streamAttr = html.match(/data-stream-url="([^"]+)"/i)?.[1]
    if (!streamAttr) return null

    const streamPath = decodeHtml(streamAttr)
    const playlistUrl = absoluteUrl(streamPath, playUrl)
    if (!playlistUrl) return null

    const title =
      html.match(/data-player-title="([^"]+)"/i)?.[1]?.trim() ||
      'HDMovie2'

    const tracksAttr = html.match(/data-player-tracks="([^"]+)"/i)?.[1]
    const tracks: Array<{ file: string; label: string }> = []
    if (tracksAttr) {
      try {
        const parsed = JSON.parse(decodeHtml(tracksAttr)) as Array<{
          file?: string
          label?: string
        }>
        for (const row of parsed) {
          if (!row.file) continue
          const file = absoluteUrl(row.file, playUrl)
          if (file) tracks.push({ file, label: row.label || 'Unknown' })
        }
      } catch {
        // ignore bad track JSON
      }
    }

    return { playlistUrl, title, tracks }
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

function buildSearchQueries(
  title: string,
  mediaType: 'movie' | 'tv',
  season: number | undefined,
  year: string | null,
): string[] {
  const out: string[] = []
  if (mediaType === 'tv' && season != null) {
    out.push(`${title} Season ${season}`)
    out.push(`${title} S${String(season).padStart(2, '0')}`)
  }
  if (year) out.push(`${title} ${year}`)
  out.push(title)
  return [...new Set(out.map((q) => q.trim()).filter(Boolean))]
}

function extractSearchHits(html: string, baseUrl: string): SearchHit[] {
  const seen = new Set<string>()
  const hits: SearchHit[] = []

  const re =
    /<a[^>]+href="(https?:\/\/[^"]+\/movie\/[^"]+|\/movie\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const url = absoluteUrl(m[1], baseUrl)
    if (!url || !/\/movie\//i.test(url) || seen.has(url)) continue
    // Skip bare /movie/ index
    if (/\/movie\/?$/i.test(url)) continue
    seen.add(url)

    const inner = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const title =
      inner ||
      decodeURIComponent(url.split('/movie/')[1] || '')
        .replace(/-\d+\/?$/, '')
        .replace(/-/g, ' ')

    hits.push({ title, url, score: 0 })
  }

  // Fallback: bare href scan when anchors wrap images only
  if (!hits.length) {
    const hrefRe = /href="(https?:\/\/[^"]*\/movie\/[^"]+|\/movie\/[^"]+)"/gi
    while ((m = hrefRe.exec(html))) {
      const url = absoluteUrl(m[1], baseUrl)
      if (!url || !/\/movie\//i.test(url) || /\/movie\/?$/i.test(url) || seen.has(url)) {
        continue
      }
      seen.add(url)
      const slug = decodeURIComponent(url.split('/movie/')[1] || '')
        .replace(/\/$/, '')
        .replace(/-\d+$/, '')
        .replace(/-/g, ' ')
      hits.push({ title: slug, url, score: 0 })
    }
  }

  return hits
}

function scoreHit(
  hit: SearchHit,
  wantTitle: string,
  year: string | null,
  mediaType: 'movie' | 'tv',
  season: number | undefined,
  preferHindi: boolean,
): number {
  const page = hit.title
  const normPage = normalizeTitle(page)
  const normWant = normalizeTitle(wantTitle)
  if (!normPage || !normWant) return 0

  let score = 0
  if (normPage === normWant) score += 100
  else if (normPage.startsWith(normWant)) score += 70
  else if (normPage.includes(normWant)) score += 50
  else {
    const overlap = tokenOverlap(normWant, normPage)
    if (overlap < 0.5) return 0
    score += Math.round(overlap * 40)
  }

  if (year && new RegExp(`\\b${year}\\b`).test(page)) score += 25
  else if (year && /\b(19|20)\d{2}\b/.test(page) && !new RegExp(`\\b${year}\\b`).test(page)) {
    score -= 20
  }

  if (preferHindi) {
    if (/\bhindi\b|\bbollywood\b/i.test(page)) score += 15
    if (/\bdubbed\b/i.test(page)) score += 5
  }

  if (mediaType === 'tv') {
    if (season != null) {
      const s = String(season)
      const s2 = s.padStart(2, '0')
      if (
        new RegExp(`\\bseason\\s*0?${s}\\b`, 'i').test(page) ||
        new RegExp(`\\bs${s2}\\b`, 'i').test(page)
      ) {
        score += 30
      } else if (/\bseason\b|\bs\d{1,2}\b/i.test(page)) {
        score -= 10
      }
    }
  } else if (/\bseason\b|\bcomplete\b|\bepisode\b/i.test(page)) {
    score -= 15
  }

  return score
}

function extractEmbeds(html: string): EmbedOption[] {
  const out: EmbedOption[] = []
  const seen = new Set<string>()

  const liRe =
    /<li([^>]*)data-source-embed=['"]([^'"]+)['"]([^>]*)>([\s\S]*?)<\/li>/gi
  let m: RegExpExecArray | null
  while ((m = liRe.exec(html))) {
    const attrs = `${m[1]} ${m[3]}`
    const playUrl = iframeSrcFromEmbedAttr(m[2])
    if (!playUrl || !isSupportedPlayHost(playUrl) || seen.has(playUrl)) continue
    seen.add(playUrl)
    const label = m[4].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'Stream'
    out.push({
      playUrl,
      label,
      episode: parseEpisode(label) ?? parseEpisode(attrs),
    })
  }

  // data-first-embed / remaining data-source-embed not inside matched <li>
  const attrRe = /data-(?:first-embed|source-embed)=['"]([^'"]+)['"]/gi
  while ((m = attrRe.exec(html))) {
    const playUrl = iframeSrcFromEmbedAttr(m[1])
    if (!playUrl || !isSupportedPlayHost(playUrl) || seen.has(playUrl)) continue
    seen.add(playUrl)
    out.push({ playUrl, label: 'Stream', episode: null })
  }

  return out
}

function selectTvEmbeds(
  embeds: EmbedOption[],
  episode: number,
  maxStreams: number,
): EmbedOption[] {
  const epMatches = embeds.filter((e) => e.episode === episode)
  if (epMatches.length) return epMatches.slice(0, maxStreams)

  // Label like "Episode 3" without EP0N — already covered by parseEpisode
  const fuzzy = embeds.filter((e) =>
    new RegExp(`\\b(?:ep|episode)\\s*0*${episode}\\b`, 'i').test(e.label),
  )
  if (fuzzy.length) return fuzzy.slice(0, maxStreams)

  // Season pack with a single stream
  if (embeds.length === 1) return embeds
  return []
}

function iframeSrcFromEmbedAttr(rawAttr: string): string | null {
  const raw = decodeHtml(rawAttr)
  const src = raw.match(/src=["']([^"']+)/i)?.[1]?.trim()
  if (src && /^https?:\/\//i.test(src)) return src
  if (/^https?:\/\/hdm2\.ink\/play\?/i.test(raw)) return raw
  return null
}

function isSupportedPlayHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'hdm2.ink' || host.endsWith('.hdm2.ink')
  } catch {
    return false
  }
}

function parseEpisode(text: string): number | null {
  const m =
    text.match(/\bEP\s*0*(\d{1,3})\b/i) ||
    text.match(/\bE\s*0*(\d{1,3})\b/i) ||
    text.match(/\bepisode\s*0*(\d{1,3})\b/i)
  return m ? Number(m[1]) : null
}

function extractYear(media: ProviderMediaObject): string | null {
  const y = media.releaseYear
  if (y == null || y === '') return null
  const s = String(y).trim()
  return /^\d{4}$/.test(s) ? s : null
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(
      /\b(hindi|dubbed|dual|audio|season|complete|netflix|amzn|zee5|hotstar|web[- ]?series|hd|hdtc|bluray|web[- ]?dl|official|unofficial)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenOverlap(a: string, b: string): number {
  const at = new Set(a.split(/\s+/).filter(Boolean))
  const bt = b.split(/\s+/).filter(Boolean)
  if (!at.size || !bt.length) return 0
  let hit = 0
  for (const t of bt) if (at.has(t)) hit++
  return hit / Math.max(at.size, bt.length)
}

function decodeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function absoluteUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function createOmssProviders(
  config: Hdmovie2PluginConfig = {},
): BaseProvider[] {
  return [new Hdmovie2Provider(config)]
}
