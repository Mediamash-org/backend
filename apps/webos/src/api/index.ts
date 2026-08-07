import { apiGet } from './client'
export { isAbortError } from './client'
import type {
  GenresResponse,
  HomeResponse,
  MovieDetails,
  PaginatedMedia,
  SearchResponse,
  SeasonEpisodesResponse,
  SeasonSummary,
  SeriesDetails,
  SourcesResponse,
} from './types'

export function fetchHome(signal?: AbortSignal) {
  return apiGet<HomeResponse>('/api/home', { signal })
}

export function fetchTrending(type: 'all' | 'movie' | 'tv' = 'all', page = 1, signal?: AbortSignal) {
  return apiGet<PaginatedMedia>(`/api/trending?type=${type}&page=${page}`, { signal })
}

export function fetchMovies(opts: { category?: string; page?: number; genre?: string } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams()
  if (opts.category) params.set('category', opts.category)
  if (opts.page) params.set('page', String(opts.page))
  if (opts.genre) params.set('genre', opts.genre)
  const q = params.toString()
  return apiGet<PaginatedMedia>(`/api/movies${q ? `?${q}` : ''}`, { signal })
}

export function fetchSeries(opts: { category?: string; page?: number; genre?: string } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams()
  if (opts.category) params.set('category', opts.category)
  if (opts.page) params.set('page', String(opts.page))
  if (opts.genre) params.set('genre', opts.genre)
  const q = params.toString()
  return apiGet<PaginatedMedia>(`/api/series${q ? `?${q}` : ''}`, { signal })
}

export function fetchGenres(signal?: AbortSignal) {
  return apiGet<GenresResponse>('/api/genres', { signal })
}

export function searchContent(q: string, page = 1, signal?: AbortSignal) {
  return apiGet<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}&page=${page}`, { signal })
}

export function fetchMovie(id: string, signal?: AbortSignal) {
  return apiGet<MovieDetails>(`/api/movie/${encodeURIComponent(id)}`, { signal })
}

export function fetchSeriesDetails(id: string, signal?: AbortSignal) {
  return apiGet<SeriesDetails>(`/api/series/${encodeURIComponent(id)}`, { signal })
}

export function fetchSeasons(id: string, signal?: AbortSignal) {
  return apiGet<{ id: string; seasons: SeasonSummary[] }>(
    `/api/series/${encodeURIComponent(id)}/seasons`,
    { signal },
  )
}

export function fetchSeasonEpisodes(id: string, season: number, signal?: AbortSignal) {
  return apiGet<SeasonEpisodesResponse>(
    `/api/series/${encodeURIComponent(id)}/season/${season}`,
    { signal },
  )
}

export function fetchMovieSources(id: string, signal?: AbortSignal) {
  return apiGet<SourcesResponse>(`/v1/movies/${encodeURIComponent(id)}`, { signal })
}

export function fetchEpisodeSources(id: string, season: number, episode: number, signal?: AbortSignal) {
  return apiGet<SourcesResponse>(
    `/v1/tv/${encodeURIComponent(id)}/seasons/${season}/episodes/${episode}`,
    { signal },
  )
}

export function fetchSourcesByPath(path: string, signal?: AbortSignal) {
  return apiGet<SourcesResponse>(path, { signal })
}
