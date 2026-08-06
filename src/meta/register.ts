import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { MemoryCache } from './cache.js'
import {
  normalizeMovieDetails,
  normalizeSeasonEpisodes,
  normalizeSeriesDetails,
  normalizeSummaries,
  normalizeSummary,
} from './normalize.js'
import { TmdbClient, TmdbError } from './tmdb-client.js'
import type {
  GenresResponse,
  HomeResponse,
  MediaSummary,
  MediaType,
  PaginatedMedia,
  SearchResponse,
  SeasonSummary,
} from './types.js'

interface MetaEnv {
  TMDB_API_KEY?: string
  TMDB_CACHE_TTL?: string
  TMDB_IMAGE_BASE?: string
}

interface TmdbPaged {
  page: number
  total_pages: number
  total_results: number
  results: unknown[]
}

interface TmdbGenreList {
  genres: Array<{ id: number; name: string }>
}

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof TmdbError) {
    const status = err.status === 404 ? 404 : err.status >= 400 && err.status < 500 ? 502 : 502
    return reply.code(status === 404 ? 404 : 502).send({
      error: {
        code: err.status === 404 ? 'NOT_FOUND' : err.code,
        message: err.status === 404 ? 'Content not found' : 'Unable to load content from metadata service',
      },
    })
  }
  const message = err instanceof Error ? err.message : 'Unexpected error'
  return reply.code(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'Unable to load content' },
    // keep message out of user-facing body except for logging side
    _debug: process.env.INTERNAL_DEBUG === 'true' ? message : undefined,
  })
}

function parsePage(raw: unknown): number {
  const n = Number(raw ?? 1)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

export function createMetaService(env: MetaEnv = process.env) {
  if (!env.TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY is required for metadata routes')
  }

  const ttlSec = Number(env.TMDB_CACHE_TTL ?? 86400)
  const cache = new MemoryCache(Math.max(60, ttlSec) * 1000)
  const client = new TmdbClient({
    apiKey: env.TMDB_API_KEY,
    imageBase: env.TMDB_IMAGE_BASE,
  })

  async function genreMap(mediaType: MediaType): Promise<Map<number, string>> {
    const key = `genres:${mediaType}`
    return cache.getOrSet(key, async () => {
      const path = mediaType === 'movie' ? '/genre/movie/list' : '/genre/tv/list'
      const data = await client.get<TmdbGenreList>(path)
      return new Map(data.genres.map((g) => [g.id, g.name]))
    })
  }

  async function pagedList(
    cacheKey: string,
    path: string,
    query: Record<string, string | number | undefined>,
    fallbackType: MediaType,
  ): Promise<PaginatedMedia> {
    return cache.getOrSet(cacheKey, async () => {
      const [data, gmap] = await Promise.all([
        client.get<TmdbPaged>(path, query),
        genreMap(fallbackType),
      ])
      return {
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        items: normalizeSummaries(client, data.results as never[], fallbackType, gmap),
      }
    })
  }

  async function home(): Promise<HomeResponse> {
    return cache.getOrSet('home:v1', async () => {
      const [trending, popularMovies, popularSeries, topMovies, topSeries, upcoming] =
        await Promise.all([
          client.get<TmdbPaged>('/trending/all/week'),
          client.get<TmdbPaged>('/movie/popular', { page: 1 }),
          client.get<TmdbPaged>('/tv/popular', { page: 1 }),
          client.get<TmdbPaged>('/movie/top_rated', { page: 1 }),
          client.get<TmdbPaged>('/tv/top_rated', { page: 1 }),
          client.get<TmdbPaged>('/movie/upcoming', { page: 1 }),
        ])

      const [movieGenres, tvGenres] = await Promise.all([genreMap('movie'), genreMap('series')])
      const mergeMaps = new Map([...movieGenres, ...tvGenres])

      const trendingItems = normalizeSummaries(client, trending.results as never[], undefined, mergeMaps)
      const movieItems = normalizeSummaries(client, popularMovies.results as never[], 'movie', movieGenres)
      const seriesItems = normalizeSummaries(client, popularSeries.results as never[], 'series', tvGenres)
      const topMovieItems = normalizeSummaries(client, topMovies.results as never[], 'movie', movieGenres)
      const topSeriesItems = normalizeSummaries(client, topSeries.results as never[], 'series', tvGenres)
      const upcomingItems = normalizeSummaries(client, upcoming.results as never[], 'movie', movieGenres)

      const actionMovies = await pagedList(
        'home:action',
        '/discover/movie',
        { page: 1, with_genres: 28, sort_by: 'popularity.desc' },
        'movie',
      )
      const comedyMovies = await pagedList(
        'home:comedy',
        '/discover/movie',
        { page: 1, with_genres: 35, sort_by: 'popularity.desc' },
        'movie',
      )
      const dramaSeries = await pagedList(
        'home:drama-tv',
        '/discover/tv',
        { page: 1, with_genres: 18, sort_by: 'popularity.desc' },
        'series',
      )

      const hero = trendingItems[0] ?? movieItems[0] ?? null

      return {
        hero,
        sections: [
          { id: 'trending', title: 'Trending Now', type: 'carousel', items: trendingItems },
          { id: 'popular_movies', title: 'Popular Movies', type: 'carousel', items: movieItems },
          { id: 'popular_series', title: 'Popular Series', type: 'carousel', items: seriesItems },
          { id: 'top_movies', title: 'Top Rated Movies', type: 'carousel', items: topMovieItems },
          { id: 'top_series', title: 'Top Rated Series', type: 'carousel', items: topSeriesItems },
          { id: 'upcoming', title: 'Upcoming', type: 'carousel', items: upcomingItems },
          { id: 'action', title: 'Action', type: 'carousel', items: actionMovies.items },
          { id: 'comedy', title: 'Comedy', type: 'carousel', items: comedyMovies.items },
          { id: 'drama', title: 'Drama Series', type: 'carousel', items: dramaSeries.items },
        ],
      }
    }, 15 * 60 * 1000)
  }

  async function trending(media: 'all' | 'movie' | 'tv' = 'all', page = 1): Promise<PaginatedMedia> {
    const typePath = media === 'all' ? 'all' : media
    const fallback: MediaType | undefined = media === 'movie' ? 'movie' : media === 'tv' ? 'series' : undefined
    return cache.getOrSet(`trending:${typePath}:${page}`, async () => {
      const data = await client.get<TmdbPaged>(`/trending/${typePath}/week`, { page })
      const [movieGenres, tvGenres] = await Promise.all([genreMap('movie'), genreMap('series')])
      const gmap = new Map([...movieGenres, ...tvGenres])
      return {
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        items: normalizeSummaries(client, data.results as never[], fallback, gmap),
      }
    })
  }

  async function movies(opts: {
    category?: string
    page?: number
    genre?: string
  }): Promise<PaginatedMedia> {
    const page = opts.page ?? 1
    const category = opts.category ?? 'popular'
    if (opts.genre) {
      return pagedList(
        `movies:genre:${opts.genre}:${page}`,
        '/discover/movie',
        { page, with_genres: opts.genre, sort_by: 'popularity.desc' },
        'movie',
      )
    }
    const allowed = new Set(['popular', 'top_rated', 'upcoming', 'now_playing'])
    const cat = allowed.has(category) ? category : 'popular'
    return pagedList(`movies:${cat}:${page}`, `/movie/${cat}`, { page }, 'movie')
  }

  async function series(opts: {
    category?: string
    page?: number
    genre?: string
  }): Promise<PaginatedMedia> {
    const page = opts.page ?? 1
    const category = opts.category ?? 'popular'
    if (opts.genre) {
      return pagedList(
        `series:genre:${opts.genre}:${page}`,
        '/discover/tv',
        { page, with_genres: opts.genre, sort_by: 'popularity.desc' },
        'series',
      )
    }
    const allowed = new Set(['popular', 'top_rated', 'on_the_air', 'airing_today'])
    const cat = allowed.has(category) ? category : 'popular'
    return pagedList(`series:${cat}:${page}`, `/tv/${cat}`, { page }, 'series')
  }

  async function genres(): Promise<GenresResponse> {
    return cache.getOrSet('genres:all', async () => {
      const [movies, tv] = await Promise.all([
        client.get<TmdbGenreList>('/genre/movie/list'),
        client.get<TmdbGenreList>('/genre/tv/list'),
      ])
      return {
        movies: movies.genres.map((g) => ({ id: g.id, name: g.name, mediaType: 'movie' as const })),
        series: tv.genres.map((g) => ({ id: g.id, name: g.name, mediaType: 'series' as const })),
      }
    })
  }

  async function search(q: string, page = 1): Promise<SearchResponse> {
    const query = q.trim()
    if (!query) {
      return { query, page: 1, totalPages: 0, totalResults: 0, items: [] }
    }
    return cache.getOrSet(`search:${query.toLowerCase()}:${page}`, async () => {
      const data = await client.get<TmdbPaged>('/search/multi', { query, page, include_adult: 'false' })
      const [movieGenres, tvGenres] = await Promise.all([genreMap('movie'), genreMap('series')])
      const gmap = new Map([...movieGenres, ...tvGenres])
      const items: MediaSummary[] = []
      for (const raw of data.results as never[]) {
        const summary = normalizeSummary(client, raw, undefined, gmap)
        if (summary) items.push(summary)
      }
      return {
        query,
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        items,
      }
    }, 5 * 60 * 1000)
  }

  async function movieDetails(id: string) {
    return cache.getOrSet(`movie:${id}`, async () => {
      const raw = await client.get(`/movie/${id}`, {
        append_to_response: 'credits,videos,recommendations',
      })
      return normalizeMovieDetails(client, raw as never)
    })
  }

  async function seriesDetails(id: string) {
    return cache.getOrSet(`series:${id}`, async () => {
      const raw = await client.get(`/tv/${id}`, {
        append_to_response: 'credits,videos,recommendations',
      })
      return normalizeSeriesDetails(client, raw as never)
    })
  }

  async function seriesSeasons(id: string): Promise<{ id: string; seasons: SeasonSummary[] }> {
    const details = await seriesDetails(id)
    return { id, seasons: details.seasons }
  }

  async function seasonEpisodes(id: string, season: number) {
    return cache.getOrSet(`series:${id}:season:${season}`, async () => {
      const raw = await client.get(`/tv/${id}/season/${season}`)
      return normalizeSeasonEpisodes(client, id, raw as never)
    })
  }

  return {
    home,
    trending,
    movies,
    series,
    genres,
    search,
    movieDetails,
    seriesDetails,
    seriesSeasons,
    seasonEpisodes,
  }
}

export type MetaService = ReturnType<typeof createMetaService>

/**
 * Catalog / discovery routes for the webOS client — not part of the OMSS protocol.
 */
export function registerMetaRoutes(app: FastifyInstance, env: MetaEnv = process.env): MetaService {
  const meta = createMetaService(env)

  app.get('/api/home', async (_req, reply) => {
    try {
      return await meta.home()
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get('/api/trending', async (request: FastifyRequest<{ Querystring: { type?: string; page?: string } }>, reply) => {
    try {
      const typeRaw = request.query.type ?? 'all'
      const type = typeRaw === 'movie' || typeRaw === 'tv' || typeRaw === 'all' ? typeRaw : 'all'
      return await meta.trending(type, parsePage(request.query.page))
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get(
    '/api/movies',
    async (
      request: FastifyRequest<{ Querystring: { category?: string; page?: string; genre?: string } }>,
      reply,
    ) => {
      try {
        return await meta.movies({
          category: request.query.category,
          page: parsePage(request.query.page),
          genre: request.query.genre,
        })
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  app.get(
    '/api/series',
    async (
      request: FastifyRequest<{ Querystring: { category?: string; page?: string; genre?: string } }>,
      reply,
    ) => {
      try {
        return await meta.series({
          category: request.query.category,
          page: parsePage(request.query.page),
          genre: request.query.genre,
        })
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  app.get('/api/genres', async (_req, reply) => {
    try {
      return await meta.genres()
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get(
    '/api/search',
    async (request: FastifyRequest<{ Querystring: { q?: string; page?: string } }>, reply) => {
      try {
        const q = request.query.q ?? ''
        return await meta.search(q, parsePage(request.query.page))
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  app.get('/api/movie/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      return await meta.movieDetails(request.params.id)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get('/api/series/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      return await meta.seriesDetails(request.params.id)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get('/api/series/:id/seasons', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      return await meta.seriesSeasons(request.params.id)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get(
    '/api/series/:id/season/:season',
    async (request: FastifyRequest<{ Params: { id: string; season: string } }>, reply) => {
      try {
        const season = Number(request.params.season)
        if (!Number.isFinite(season) || season < 0) {
          return reply.code(400).send({
            error: { code: 'BAD_REQUEST', message: 'Invalid season number' },
          })
        }
        return await meta.seasonEpisodes(request.params.id, season)
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  return meta
}
