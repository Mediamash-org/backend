import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
} from '@omss/framework'

export interface FilmoPluginConfig {
  id?: string
  name?: string
  baseUrl?: string
  /** Max VOE provider chips to mint/resolve */
  maxProviders?: number
  timeoutMs?: number
}

type SuggestHit = { title: string; url: string }

type ProviderChip = {
  linkId: string
  p: string
  label: string
}

type VoeConfig = {
  source?: string
  direct_access_url?: string
  file_code?: string
  title?: string
  site_name?: string
  captions?: Array<{ file?: string; label?: string }>
}

type CookieJar = { map: Record<string, string> }

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const VOE_PATTERNS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'] as const

/**
 * OMSS provider for [Filmo](https://filmo.to/) — movie catalog + VOE HLS.
 */
export class FilmoProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS: Record<string, string>
  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies'],
  }

  private readonly maxProviders: number
  private readonly timeoutMs: number

  constructor(config: FilmoPluginConfig = {}) {
    super()
    this.id = config.id ?? 'filmo'
    this.name = config.name ?? 'Filmo'
    this.BASE_URL = (
      config.baseUrl ??
      process.env.FILMO_BASE_URL ??
      'https://filmo.to'
    ).replace(/\/$/, '')
    this.maxProviders =
      config.maxProviders ?? Number(process.env.FILMO_MAX_PROVIDERS ?? 4)
    this.timeoutMs =
      config.timeoutMs ?? Number(process.env.FILMO_TIMEOUT_MS ?? 20_000)

    this.HEADERS = {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/json,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
      Origin: this.BASE_URL,
      Referer: `${this.BASE_URL}/`,
    }
  }

  async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
    return this.getSources(media)
  }

  async getTVSources(_media: ProviderMediaObject): Promise<ProviderResult> {
    return this.emptyResult('Filmo is movies-only')
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.fetchText(`${this.BASE_URL}/`, {}, newJar())
      return Boolean(response)
    } catch {
      return false
    }
  }

  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching Filmo sources', media)

    if (media.type === 'tv') return this.emptyResult('Filmo is movies-only')

    const title = typeof media.title === 'string' ? media.title.trim() : ''
    if (!title) return this.emptyResult('Missing title for Filmo search')

    const year = extractYear(media)

    try {
      const jar = newJar()
      await this.fetchText(`${this.BASE_URL}/`, {}, jar)

      const hit = await this.resolveSuggest(title, year, jar)
      if (!hit) {
        return this.emptyResult(
          `No Filmo suggest match for "${title}"${year ? ` (${year})` : ''}`,
        )
      }

      const movieHtml = await this.fetchText(hit.url, {}, jar)
      if (!movieHtml) return this.emptyResult('Failed to fetch Filmo movie page')

      if (year) {
        const pageYear = extractPageYear(movieHtml)
        if (pageYear && pageYear !== year) {
          return this.emptyResult(
            `Year mismatch for "${hit.title}": page=${pageYear} want=${year}`,
          )
        }
      }

      const csrf = movieHtml.match(/csrf-token" content="([^"]+)"/)?.[1] || ''
      const chips = dedupeChips(extractProviderChips(movieHtml)).slice(
        0,
        this.maxProviders,
      )
      if (!chips.length) return this.emptyResult('No Filmo provider chips on movie page')

      const streamHeadersBase = {
        'User-Agent': DEFAULT_UA,
        Accept: '*/*',
      }

      const sources: Source[] = []
      const seen = new Set<string>()

      for (const chip of chips) {
        const voe = await this.resolveVoeFromChip(chip, csrf, hit.url, jar)
        if (!voe?.source) continue

        const key = voe.file_code || stripQuery(voe.source)
        if (seen.has(key)) continue
        seen.add(key)

        const origin = originOf(voe.source) || 'https://voe.sx'
        const headers = {
          ...streamHeadersBase,
          Referer: `${origin}/`,
          Origin: origin,
        }

        sources.push({
          url: this.createProxyUrl(voe.source, headers),
          type: 'hls',
          quality: 'Auto',
          audioTracks: [{ label: chip.label || 'VOE', language: 'und' }],
          provider: {
            id: this.id,
            name: `${this.name}/${chip.label || 'VOE'}`,
          },
        })
      }

      if (!sources.length) return this.emptyResult('No Filmo/VOE HLS sources resolved')
      return { sources, subtitles: [], diagnostics: [] }
    } catch (error) {
      return this.emptyResult(error instanceof Error ? error.message : 'Unknown provider error')
    }
  }

  private async resolveSuggest(
    title: string,
    year: string | null,
    jar: CookieJar,
  ): Promise<SuggestHit | null> {
    const url = `${this.BASE_URL}/search/suggest?q=${encodeURIComponent(title)}`
    const json = await this.fetchJson<{ movies?: SuggestHit[] }>(
      url,
      {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      jar,
    )
    const movies = Array.isArray(json?.movies) ? json.movies : []
    if (!movies.length) return null

    const normWant = normalizeTitle(title)
    const exact = movies.filter((m) => normalizeTitle(m.title) === normWant)
    const pool = exact.length ? exact : movies

    if (year && pool.length > 1) {
      for (const cand of pool.slice(0, 5)) {
        const html = await this.fetchText(cand.url, {}, jar)
        if (!html) continue
        if (extractPageYear(html) === year) return cand
      }
    }

    return pool[0] ?? null
  }

  private async resolveVoeFromChip(
    chip: ProviderChip,
    csrf: string,
    referer: string,
    jar: CookieJar,
  ): Promise<VoeConfig | null> {
    const mint = await this.fetchJson<{ x?: string }>(
      `${this.BASE_URL}/n`,
      {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': csrf,
        'X-XSRF-TOKEN': decodeURIComponent(jar.map['XSRF-TOKEN'] || ''),
        Referer: referer,
        Origin: this.BASE_URL,
      },
      jar,
      { method: 'POST', body: JSON.stringify({ p: chip.p }) },
    )
    const token = mint?.x
    if (!token) return null

    const embedHtml = await this.fetchText(
      `${this.BASE_URL}/n/${encodeURIComponent(token)}`,
      { Referer: referer, Accept: 'text/html,*/*' },
      jar,
    )
    if (!embedHtml) return null

    const redirect =
      embedHtml.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/)?.[1] ||
      null
    let voeHtml = embedHtml
    let voeUrl = redirect
    if (redirect) {
      const page = await this.fetchText(
        redirect,
        { Referer: `${this.BASE_URL}/`, Accept: 'text/html,*/*' },
        jar,
      )
      if (!page) return null
      voeHtml = page
      voeUrl = redirect
    }

    // Follow HTML meta refresh / nested redirect pages once more if needed
    const nested =
      voeHtml.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/)?.[1] || null
    if (nested && nested !== voeUrl && !voeHtml.includes('application/json')) {
      const page = await this.fetchText(
        nested,
        { Referer: voeUrl || `${this.BASE_URL}/`, Accept: 'text/html,*/*' },
        jar,
      )
      if (page) {
        voeHtml = page
        voeUrl = nested
      }
    }

    const encoded = extractVoeEncodedPayload(voeHtml)
    if (!encoded) return null
    return decryptVoePayload(encoded)
  }

  private async fetchText(
    url: string,
    extraHeaders: Record<string, string>,
    jar: CookieJar,
  ): Promise<string | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, {
        headers: {
          ...this.HEADERS,
          ...extraHeaders,
          Cookie: cookieHeader(jar),
        },
        signal: controller.signal,
        redirect: 'follow',
      })
      absorbSetCookie(jar, response.headers)
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
    extraHeaders: Record<string, string>,
    jar: CookieJar,
    init: { method?: string; body?: string } = {},
  ): Promise<T | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, {
        method: init.method || 'GET',
        body: init.body,
        headers: {
          ...this.HEADERS,
          ...extraHeaders,
          Cookie: cookieHeader(jar),
        },
        signal: controller.signal,
        redirect: 'follow',
      })
      absorbSetCookie(jar, response.headers)
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

function newJar(): CookieJar {
  return { map: {} }
}

function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar.map)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function absorbSetCookie(jar: CookieJar, headers: Headers): void {
  const set =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie')!]
        : []
  for (const c of set) {
    const part = c.split(';')[0]
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    jar.map[part.slice(0, eq)] = part.slice(eq + 1)
  }
}

export function extractProviderChips(html: string): ProviderChip[] {
  const out: ProviderChip[] = []
  let i = 0
  while ((i = html.indexOf('data-provider-chip', i)) >= 0) {
    const chunk = html.slice(i, i + 1400)
    const linkId = chunk.match(/data-movie-link-id="(\d+)"/)?.[1] || ''
    const p = chunk.match(/data-p="([^"]+)"/)?.[1]
    const label =
      chunk.match(/aria-label="([^"]+)"/)?.[1]?.trim() ||
      chunk.match(/>(\s*[A-Za-z0-9][^<]{0,24})\s*</)?.[1]?.trim() ||
      'VOE'
    if (p) out.push({ linkId, p, label })
    i += 18
  }
  return out
}

function dedupeChips(chips: ProviderChip[]): ProviderChip[] {
  const seen = new Set<string>()
  const out: ProviderChip[] = []
  for (const c of chips) {
    const key = c.linkId || c.p.slice(0, 40)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

export function extractVoeEncodedPayload(html: string): string | null {
  const match = html.match(
    /<script[^>]*type=["']application\/json["'][^>]*>\s*(\[[\s\S]*?\])\s*<\/script>/i,
  )
  if (!match?.[1]) return null
  try {
    const arr = JSON.parse(match[1]) as unknown
    if (Array.isArray(arr) && typeof arr[0] === 'string') return arr[0]
  } catch {
    /* ignore */
  }
  return null
}

/** VOE F7-style payload decrypt (rot13 → patterns → b64 → shift3 → reverse → b64 → JSON). */
export function decryptVoePayload(encoded: string): VoeConfig {
  const vF = rot13(encoded)
  const vF2 = replacePatterns(vF)
  const vF3 = vF2.replace(/_/g, '')
  const vF4 = Buffer.from(vF3, 'base64').toString('utf8')
  const vF5 = charShift(vF4, 3)
  const vF6 = vF5.split('').reverse().join('')
  const json = Buffer.from(vF6, 'base64').toString('utf8')
  return JSON.parse(json) as VoeConfig
}

function rot13(input: string): string {
  return input.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function replacePatterns(input: string): string {
  let out = input
  for (const p of VOE_PATTERNS) out = out.split(p).join('_')
  return out
}

function charShift(input: string, shift: number): string {
  return [...input].map((c) => String.fromCharCode(c.charCodeAt(0) - shift)).join('')
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extractYear(media: ProviderMediaObject): string | null {
  const y = (media as { year?: string | number }).year
  if (y == null || y === '') return null
  const s = String(y).trim()
  return /^\d{4}$/.test(s) ? s : null
}

export function extractPageYear(html: string): string | null {
  const m =
    html.match(/ft-meta-label[^>]*>\s*(20\d{2}|19\d{2})\s*</i) ||
    html.match(/property="og:release_date" content="(\d{4})/) ||
    html.match(/\b(20\d{2}|19\d{2})\b[^<]{0,20}min/i)
  return m?.[1] ?? null
}

function stripQuery(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return url
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function createOmssProviders(config: FilmoPluginConfig = {}): BaseProvider[] {
  return [new FilmoProvider(config)]
}
