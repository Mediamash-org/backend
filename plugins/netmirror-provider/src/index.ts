import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
  Subtitle,
  Diagnostic,
} from '@omss/framework'
import type {
  AoneRoomResponse,
  Net27Caption,
  Net27Response,
  Net27Stream,
  Net27VariantsResponse,
} from './types.js'

export interface NetMirrorPluginConfig {
  id?: string
  name?: string
  /** Upstream API base (default https://net27.cc) */
  baseUrl?: string
  /** Referer sent when proxying streams (NetMirror uses videodownloader.site) */
  streamReferer?: string
  /** Fetch language dub variants via aoneroom (default true) */
  fetchDubs?: boolean
  /** Request timeout ms (default 15000) */
  timeoutMs?: number
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'

/**
 * OMSS provider ported from NetMirror Cloudstream extension
 * (NetMirror-Extension-master / NetMirrorProvider.kt).
 *
 * Source resolution only — TMDB search/catalog stay out of OMSS (host/TMDB).
 */
export class NetMirrorProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  private readonly streamReferer: string
  private readonly fetchDubs: boolean
  private readonly timeoutMs: number
  private readonly jsonHeaders: Record<string, string>

  constructor(config: NetMirrorPluginConfig = {}) {
    super()
    this.id = config.id ?? 'netmirror'
    this.name = config.name ?? 'NetMirror'
    this.BASE_URL = (config.baseUrl ?? process.env.NETMIRROR_BASE_URL ?? 'https://net27.cc').replace(
      /\/$/,
      '',
    )
    this.streamReferer =
      config.streamReferer ??
      process.env.NETMIRROR_STREAM_REFERER ??
      'https://videodownloader.site/'
    this.fetchDubs = config.fetchDubs ?? process.env.NETMIRROR_FETCH_DUBS !== 'false'
    this.timeoutMs = config.timeoutMs ?? Number(process.env.NETMIRROR_TIMEOUT_MS ?? 15_000)

    this.jsonHeaders = {
      Accept: 'application/json',
      'User-Agent': DEFAULT_UA,
    }

    this.HEADERS = {
      Referer: this.streamReferer,
      'User-Agent': DEFAULT_UA,
    }
  }

  async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
    return this.resolveSources(media.tmdbId, false)
  }

  async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
    return this.resolveSources(media.tmdbId, true, media.s ?? 1, media.e ?? 1)
  }

  async healthCheck(): Promise<boolean> {
    return this.enabled
  }

  private async resolveSources(
    tmdbId: string,
    isTv: boolean,
    season?: number,
    episode?: number,
  ): Promise<ProviderResult> {
    const diagnostics: Diagnostic[] = []
    const sources: Source[] = []
    const subtitles: Subtitle[] = []

    try {
      const variantsUrl = isTv
        ? `${this.BASE_URL}/api/variants-tmdb/tv/${tmdbId}?se=${season}&ep=${episode ?? 1}`
        : `${this.BASE_URL}/api/variants-tmdb/movie/${tmdbId}`

      const variantsRes = await this.fetchJson<Net27VariantsResponse>(variantsUrl)
      if (!variantsRes?.ok) {
        return {
          sources: [],
          subtitles: [],
          diagnostics: [
            {
              code: 'PROVIDER_ERROR',
              message: `${this.name}: variants unavailable for TMDB ${tmdbId}`,
              field: '',
              severity: 'error',
            },
          ],
        }
      }

      const defaultSid = variantsRes.defaultSubjectId
      const defaultDp = variantsRes.defaultDetailPath
      const dubVariants = variantsRes.variants ?? []

      // 1. Default embed
      await this.collectEmbed(
        {
          tmdbId,
          isTv,
          season,
          episode,
          sid: defaultSid,
          dp: defaultDp,
          audioLang: 'Default',
        },
        sources,
        subtitles,
        diagnostics,
      )

      // 2. Optional dubs via aoneroom (same as Kotlin extension)
      if (this.fetchDubs && defaultDp && dubVariants.length > 0) {
        try {
          const detailUrl = `https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?detailPath=${encodeURIComponent(defaultDp)}`
          const detailRes = await this.fetchJson<AoneRoomResponse>(detailUrl)
          const dubs = detailRes?.data?.subject?.dubs ?? []
          const processed = new Set<string>()

          for (const v of dubVariants) {
            const lang = v.language
            const dubSid = v.dubSubjectId
            if (!lang || !dubSid || processed.has(lang)) continue
            processed.add(lang)

            const dubDp = dubs.find((d) => d.subjectId === dubSid)?.detailPath
            if (!dubDp || !defaultSid || !defaultDp) continue

            await this.collectEmbed(
              {
                tmdbId,
                isTv,
                season,
                episode,
                sid: dubSid,
                dp: dubDp,
                audioLang: lang,
                defaultSid,
                defaultDp,
              },
              sources,
              subtitles,
              diagnostics,
            )
          }
        } catch (error) {
          diagnostics.push({
            code: 'PARTIAL_SCRAPE',
            message: `${this.name}: dub lookup failed (${error instanceof Error ? error.message : 'unknown'})`,
            field: '',
            severity: 'warning',
          })
        }
      }

      if (sources.length === 0) {
        diagnostics.push({
          code: 'PROVIDER_ERROR',
          message: `${this.name}: no streams returned for TMDB ${tmdbId}`,
          field: '',
          severity: 'error',
        })
      }

      return {
        sources: this.dedupeSources(sources),
        subtitles: this.dedupeSubtitles(subtitles),
        diagnostics,
      }
    } catch (error) {
      return {
        sources: [],
        subtitles: [],
        diagnostics: [
          {
            code: 'PROVIDER_ERROR',
            message: `${this.name} failed: ${error instanceof Error ? error.message : 'unknown'}`,
            field: '',
            severity: 'error',
          },
        ],
      }
    }
  }

  private async collectEmbed(
    opts: {
      tmdbId: string
      isTv: boolean
      season?: number
      episode?: number
      sid?: string
      dp?: string
      audioLang: string
      defaultSid?: string
      defaultDp?: string
    },
    sources: Source[],
    subtitles: Subtitle[],
    diagnostics: Diagnostic[],
  ): Promise<void> {
    const typeStr = opts.isTv ? 'tv' : 'movie'
    let embedUrl = `${this.BASE_URL}/api/embed-tmdb/${opts.tmdbId}?type=${typeStr}`
    if (opts.isTv) {
      embedUrl += `&se=${opts.season ?? 1}&ep=${opts.episode ?? 1}`
    }
    if (opts.sid && opts.dp) {
      if (opts.defaultSid && opts.defaultDp) {
        embedUrl += `&dub=${encodeURIComponent(opts.sid)}&dubdp=${encodeURIComponent(opts.dp)}&sid=${encodeURIComponent(opts.defaultSid)}&dp=${encodeURIComponent(opts.defaultDp)}`
      } else {
        embedUrl += `&sid=${encodeURIComponent(opts.sid)}&dp=${encodeURIComponent(opts.dp)}`
      }
    }

    const response = await this.fetchJson<Net27Response>(embedUrl)
    if (!response?.ok) {
      diagnostics.push({
        code: 'PARTIAL_SCRAPE',
        message: `${this.name}: embed failed for ${opts.audioLang}`,
        field: '',
        severity: 'warning',
      })
      return
    }

    const streams = [...(response.streams ?? [])].sort((a, b) => b.resolution - a.resolution)
    for (const stream of streams) {
      sources.push(this.toSource(stream, opts.audioLang))
    }

    if (streams.length === 0 && response.mp4) {
      sources.push(
        this.toSource(
          {
            url: response.mp4,
            resolution:
              typeof response.resolution === 'number'
                ? response.resolution
                : Number(response.resolution) || 0,
          },
          opts.audioLang,
        ),
      )
    }

    for (const caption of response.captions ?? []) {
      const sub = this.toSubtitle(caption)
      if (sub) subtitles.push(sub)
    }
  }

  private toSource(stream: Net27Stream, audioLang: string): Source {
    const quality =
      stream.resolution > 0 ? this.mapResolution(stream.resolution) : this.inferQuality(stream.url)

    return {
      url: this.createProxyUrl(stream.url, this.HEADERS),
      type: this.inferType(stream.url) === 'embed' ? 'mp4' : (this.inferType(stream.url) as Source['type']),
      quality,
      audioTracks: [
        {
          language: this.langCode(audioLang),
          label: audioLang === 'Default' ? 'Original' : audioLang,
        },
      ],
      provider: { id: this.id, name: this.name },
    }
  }

  private toSubtitle(caption: Net27Caption): Subtitle | null {
    if (!caption.url) return null
    const url = caption.url.startsWith('/')
      ? `${this.BASE_URL}${caption.url}`
      : caption.url
    const label = caption.name ?? caption.lang ?? 'Unknown'
    const lower = url.toLowerCase()
    const format = lower.includes('.srt') ? 'srt' : 'vtt'

    return {
      url: this.createProxyUrl(url, this.HEADERS),
      label,
      format,
    }
  }

  private mapResolution(height: number): string {
    if (height >= 2160) return '2160p'
    if (height >= 1080) return '1080p'
    if (height >= 720) return '720p'
    if (height >= 480) return '480p'
    if (height >= 360) return '360p'
    return 'unknown'
  }

  private langCode(label: string): string {
    const lower = label.toLowerCase()
    if (lower === 'default' || lower === 'original') return 'en'
    if (lower.startsWith('en')) return 'en'
    if (lower.startsWith('es') || lower.includes('spanish')) return 'es'
    if (lower.startsWith('hi') || lower.includes('hindi')) return 'hi'
    if (lower.startsWith('fr')) return 'fr'
    if (lower.startsWith('de')) return 'de'
    if (lower.startsWith('ja')) return 'ja'
    if (lower.startsWith('ko')) return 'ko'
    return lower.slice(0, 8)
  }

  private dedupeSources(sources: Source[]): Source[] {
    const seen = new Set<string>()
    return sources.filter((s) => {
      if (seen.has(s.url)) return false
      seen.add(s.url)
      return true
    })
  }

  private dedupeSubtitles(subs: Subtitle[]): Subtitle[] {
    const seen = new Set<string>()
    return subs.filter((s) => {
      if (seen.has(s.url)) return false
      seen.add(s.url)
      return true
    })
  }

  private async fetchJson<T>(
    url: string,
    init: RequestInit = {},
  ): Promise<T | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...this.jsonHeaders,
          ...(init.headers as Record<string, string> | undefined),
        },
        signal: controller.signal,
      })

      if (init.method === 'HEAD') {
        return (res.ok ? ({} as T) : null)
      }

      if (!res.ok) {
        this.console.warn(`HTTP ${res.status} for ${url}`)
        return null
      }

      return (await res.json()) as T
    } catch (error) {
      this.console.warn(
        `fetch failed: ${url} (${error instanceof Error ? error.message : 'unknown'})`,
      )
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

/** Preferred plugin entry — config from config/providers.json. */
export function createOmssProviders(
  config: NetMirrorPluginConfig = {},
): BaseProvider[] {
  return [new NetMirrorProvider(config)]
}
