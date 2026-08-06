export class TmdbError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = 'TMDB_ERROR',
  ) {
    super(message)
    this.name = 'TmdbError'
  }
}

export interface TmdbClientOptions {
  apiKey: string
  imageBase?: string
  cacheTtlMs?: number
  fetchImpl?: typeof fetch
}

type Query = Record<string, string | number | undefined | null>

export class TmdbClient {
  private readonly apiKey: string
  readonly imageBase: string
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl = 'https://api.themoviedb.org/3'

  constructor(options: TmdbClientOptions) {
    this.apiKey = options.apiKey
    this.imageBase = (options.imageBase ?? 'https://image.tmdb.org/t/p').replace(/\/$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  imageUrl(path: string | null | undefined, size: string): string | null {
    if (!path) return null
    if (path.startsWith('http://') || path.startsWith('https://')) return path
    return `${this.imageBase}/${size}${path.startsWith('/') ? path : `/${path}`}`
  }

  async get<T>(path: string, query: Query = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`)
    url.searchParams.set('api_key', this.apiKey)
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }

    const res = await this.fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      let message = `TMDB request failed (${res.status})`
      try {
        const body = (await res.json()) as { status_message?: string }
        if (body.status_message) message = body.status_message
      } catch {
        // ignore parse errors
      }
      throw new TmdbError(message, res.status)
    }

    return (await res.json()) as T
  }
}
