import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
} from '@omss/framework'

export interface VidSrcPluginConfig {
  id?: string
  name?: string
  /** Embed origin (docs: https://vsembed.ru/) */
  baseUrl?: string
  /** Referer/Origin for proxied HLS (defaults to player host from scrape) */
  streamReferer?: string
  /** Override `{v1}`…`{v4}` domain map used in player `file:` templates */
  playerDomains?: Record<string, string>
  timeoutMs?: number
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

/** Placeholders used in VidSrc player `file:` fields (cinepro-org/core). */
const DEFAULT_PLAYER_DOMAINS: Record<string, string> = {
  '{v1}': 'neonhorizonworkshops.com',
  '{v2}': 'wanderlynest.com',
  '{v3}': 'orchidpixelgardens.com',
  '{v4}': 'cloudnestra.com',
}

/**
 * OMSS provider for [VidSrc / vsembed.ru](https://vsembed.ru/).
 *
 * Ported from cinepro-org/core `VidSrcProvider`:
 * embed → RCP iframe → prorcp page → `file:` m3u8 templates.
 *
 * @see https://github.com/cinepro-org/core/blob/main/src/providers/vidsrc/vidsrc.ts
 */
export class VidSrcProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly streamReferer?: string
  private readonly playerDomains: Record<string, string>
  private readonly timeoutMs: number

  constructor(config: VidSrcPluginConfig = {}) {
    super()
    this.id = config.id ?? 'vidsrc'
    this.name = config.name ?? 'VidSrc'
    this.BASE_URL = (
      config.baseUrl ??
      process.env.VIDSRC_BASE_URL ??
      'https://vsembed.ru'
    ).replace(/\/$/, '')
    this.streamReferer =
      config.streamReferer ?? process.env.VIDSRC_STREAM_REFERER ?? undefined
    this.playerDomains = {
      ...DEFAULT_PLAYER_DOMAINS,
      ...(config.playerDomains ?? {}),
    }
    this.timeoutMs = config.timeoutMs ?? Number(process.env.VIDSRC_TIMEOUT_MS ?? 20_000)

    this.HEADERS = {
      'User-Agent': DEFAULT_UA,
      Referer: `${this.BASE_URL}/`,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
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
    this.console.log('Fetching VidSrc sources', media)

    try {
      const pageUrl = this.buildPageUrl(media)
      const html = await this.fetchPage(pageUrl)
      if (!html) return this.emptyResult('Failed to fetch embed page')

      const secondUrl = this.extractSecondUrl(html)
      if (!secondUrl) return this.emptyResult('Invalid or expired token (no RCP iframe)')

      const secondHtml = await this.fetchPage(secondUrl)
      if (!secondHtml) return this.emptyResult('Failed to fetch RCP page')

      const thirdUrl = this.extractThirdUrl(secondHtml, secondUrl)
      if (!thirdUrl) return this.emptyResult('Failed to extract prorcp URL')

      const thirdHtml = await this.fetchPage(thirdUrl)
      if (!thirdHtml) return this.emptyResult('Failed to fetch final stream page')

      if (thirdHtml.includes('cf-turnstile') || thirdHtml.includes('rcp_verify')) {
        return this.emptyResult(
          'Player requires Cloudflare Turnstile (VPN/datacenter IPs are often blocked)',
        )
      }

      const m3u8Urls = this.extractM3u8Urls(thirdHtml)
      if (!m3u8Urls.length) return this.emptyResult('Failed to extract m3u8 URLs')

      const playerOrigin = this.originOf(secondUrl) ?? 'https://cloudnestra.com'
      const streamHeaders = {
        ...this.HEADERS,
        Referer: this.streamReferer ?? `${playerOrigin}/`,
        Origin: this.streamReferer?.replace(/\/$/, '') ?? playerOrigin,
      }

      const sources: Source[] = m3u8Urls.map((url) => ({
        url: this.createProxyUrl(url, streamHeaders),
        type: 'hls' as const,
        quality: 'Auto',
        audioTracks: [{ label: 'English', language: 'eng' }],
        provider: { id: this.id, name: this.name },
      }))

      return { sources, subtitles: [], diagnostics: [] }
    } catch (error) {
      return this.emptyResult(
        error instanceof Error ? error.message : 'Unknown provider error',
      )
    }
  }

  private buildPageUrl(media: ProviderMediaObject): string {
    if (media.type === 'movie') {
      return `${this.BASE_URL}/embed/movie?tmdb=${media.tmdbId}`
    }
    const season = media.s ?? 1
    const episode = media.e ?? 1
    return `${this.BASE_URL}/embed/tv?tmdb=${media.tmdbId}&season=${season}&episode=${episode}`
  }

  private async fetchPage(url: string): Promise<string | null> {
    try {
      let resolved = url
      if (resolved.startsWith('//')) resolved = `https:${resolved}`

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const response = await fetch(resolved, {
          headers: this.HEADERS,
          signal: controller.signal,
        })
        if (!response.ok) return null
        return await response.text()
      } finally {
        clearTimeout(timer)
      }
    } catch {
      return null
    }
  }

  /** First iframe on the embed page → RCP host. */
  private extractSecondUrl(html: string): string | null {
    return html.match(/<iframe[^>]*\s+src=["']([^"']+)["'][^>]*>/i)?.[1] ?? null
  }

  /** `src: '/prorcp/...'` from RCP `loadIframe`, resolved against RCP origin. */
  private extractThirdUrl(html: string, secondUrl: string): string | null {
    const relSrc = html.match(/src:\s*['"]([^'"]+)['"]/i)?.[1]
    if (!relSrc) return null

    const base = secondUrl.startsWith('//') ? `https:${secondUrl}` : secondUrl
    try {
      return new URL(relSrc, base).href
    } catch {
      return null
    }
  }

  /**
   * Player page embeds `file: "https://{v4}/...m3u8 or https://{v1}/..."`.
   * Replace known placeholders with live CDN domains.
   */
  private extractM3u8Urls(thirdHtml: string): string[] {
    const fileField = thirdHtml.match(/file\s*:\s*["']([^"']+)["']/i)?.[1]
    if (!fileField) return []

    return fileField
      .split(/\s+or\s+/i)
      .map((template) => {
        let url = template.trim()
        for (const [placeholder, domain] of Object.entries(this.playerDomains)) {
          url = url.replaceAll(placeholder, domain)
        }
        if (url.includes('{') || url.includes('}')) return null
        if (!/^https?:\/\//i.test(url)) return null
        return url
      })
      .filter((url): url is string => url !== null)
  }

  private originOf(url: string): string | null {
    try {
      const absolute = url.startsWith('//') ? `https:${url}` : url
      return new URL(absolute).origin
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
          message: `${this.name}: ${message}. VidSrc often blocks VPN/datacenter IPs.`,
          field: '',
          severity: 'error',
        },
      ],
    }
  }
}

export function createOmssProviders(config: VidSrcPluginConfig = {}): BaseProvider[] {
  return [new VidSrcProvider(config)]
}
