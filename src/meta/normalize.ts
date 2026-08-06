import type { TmdbClient } from './tmdb-client.js'
import type {
  EpisodeSummary,
  MediaSummary,
  MediaType,
  MovieDetails,
  PersonCredit,
  SeasonEpisodesResponse,
  SeasonSummary,
  SeriesDetails,
  TrailerInfo,
} from './types.js'

interface TmdbGenre {
  id: number
  name: string
}

interface TmdbMovieListItem {
  id: number
  title?: string
  name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
  genre_ids?: number[]
  media_type?: string
}

interface TmdbCredits {
  cast?: Array<{
    id: number
    name: string
    character?: string
    profile_path?: string | null
  }>
  crew?: Array<{
    id: number
    name: string
    job?: string
    profile_path?: string | null
  }>
}

interface TmdbVideos {
  results?: Array<{
    key: string
    name: string
    site: string
    type: string
  }>
}

interface TmdbMovieDetailsRaw extends TmdbMovieListItem {
  runtime?: number | null
  genres?: TmdbGenre[]
  credits?: TmdbCredits
  videos?: TmdbVideos
  recommendations?: { results?: TmdbMovieListItem[] }
}

interface TmdbTvDetailsRaw extends TmdbMovieListItem {
  episode_run_time?: number[]
  genres?: TmdbGenre[]
  status?: string
  number_of_seasons?: number
  number_of_episodes?: number
  credits?: TmdbCredits
  videos?: TmdbVideos
  seasons?: Array<{
    season_number: number
    name: string
    episode_count: number
    poster_path?: string | null
    air_date?: string | null
    overview?: string
  }>
  recommendations?: { results?: TmdbMovieListItem[] }
}

interface TmdbSeasonRaw {
  id?: number
  name?: string
  overview?: string
  poster_path?: string | null
  air_date?: string | null
  season_number: number
  episodes?: Array<{
    id: number
    name?: string
    overview?: string
    air_date?: string | null
    runtime?: number | null
    still_path?: string | null
    episode_number: number
    season_number?: number
    vote_average?: number
  }>
}

function yearFromDate(date?: string | null): number | null {
  if (!date || date.length < 4) return null
  const year = Number(date.slice(0, 4))
  return Number.isFinite(year) ? year : null
}

function resolveType(item: TmdbMovieListItem, fallback?: MediaType): MediaType | null {
  if (item.media_type === 'movie') return 'movie'
  if (item.media_type === 'tv') return 'series'
  if (fallback) return fallback
  if (item.title && !item.name) return 'movie'
  if (item.name && !item.title) return 'series'
  return null
}

export function normalizeSummary(
  client: TmdbClient,
  item: TmdbMovieListItem,
  fallbackType?: MediaType,
  genreMap?: Map<number, string>,
): MediaSummary | null {
  const type = resolveType(item, fallbackType)
  if (!type) return null

  const title = (type === 'movie' ? item.title : item.name) || item.title || item.name
  if (!title) return null

  const date = type === 'movie' ? item.release_date : item.first_air_date
  const genres =
    item.genre_ids && genreMap
      ? item.genre_ids.map((id) => genreMap.get(id)).filter((g): g is string => Boolean(g))
      : undefined

  return {
    id: String(item.id),
    type,
    title,
    poster: client.imageUrl(item.poster_path, 'w500'),
    backdrop: client.imageUrl(item.backdrop_path, 'w1280'),
    year: yearFromDate(date),
    rating: typeof item.vote_average === 'number' ? Math.round(item.vote_average * 10) / 10 : null,
    genres: genres?.length ? genres : undefined,
    description: item.overview || undefined,
  }
}

export function normalizeSummaries(
  client: TmdbClient,
  items: TmdbMovieListItem[] | undefined,
  fallbackType?: MediaType,
  genreMap?: Map<number, string>,
): MediaSummary[] {
  if (!items?.length) return []
  const out: MediaSummary[] = []
  for (const item of items) {
    const summary = normalizeSummary(client, item, fallbackType, genreMap)
    if (summary) out.push(summary)
  }
  return out
}

function normalizeCredits(client: TmdbClient, credits?: TmdbCredits): {
  cast: PersonCredit[]
  crew: PersonCredit[]
} {
  const cast = (credits?.cast ?? []).slice(0, 16).map((c) => ({
    id: String(c.id),
    name: c.name,
    role: c.character || 'Cast',
    photo: client.imageUrl(c.profile_path, 'w185'),
  }))

  const crewJobs = new Set(['Director', 'Writer', 'Creator', 'Executive Producer', 'Producer'])
  const crew = (credits?.crew ?? [])
    .filter((c) => c.job && crewJobs.has(c.job))
    .slice(0, 12)
    .map((c) => ({
      id: String(c.id),
      name: c.name,
      role: c.job || 'Crew',
      photo: client.imageUrl(c.profile_path, 'w185'),
    }))

  return { cast, crew }
}

function normalizeTrailers(videos?: TmdbVideos): TrailerInfo[] {
  return (videos?.results ?? [])
    .filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
    .slice(0, 5)
    .map((v) => ({
      key: v.key,
      name: v.name,
      site: v.site,
      type: v.type,
      url: `https://www.youtube.com/watch?v=${v.key}`,
    }))
}

function normalizeSeasons(client: TmdbClient, seasons?: TmdbTvDetailsRaw['seasons']): SeasonSummary[] {
  return (seasons ?? [])
    .filter((s) => s.season_number > 0)
    .map((s) => ({
      seasonNumber: s.season_number,
      name: s.name,
      episodeCount: s.episode_count,
      poster: client.imageUrl(s.poster_path, 'w342'),
      airDate: s.air_date ?? null,
      description: s.overview || null,
    }))
}

export function normalizeMovieDetails(client: TmdbClient, raw: TmdbMovieDetailsRaw): MovieDetails {
  const { cast, crew } = normalizeCredits(client, raw.credits)
  const summary = normalizeSummary(client, raw, 'movie')!
  return {
    ...summary,
    type: 'movie',
    description: raw.overview || null,
    runtime: raw.runtime ?? null,
    releaseDate: raw.release_date ?? null,
    genres: (raw.genres ?? []).map((g) => g.name),
    cast,
    crew,
    trailers: normalizeTrailers(raw.videos),
    recommendations: normalizeSummaries(client, raw.recommendations?.results, 'movie'),
    stream: { moviePath: `/v1/movies/${raw.id}` },
  }
}

export function normalizeSeriesDetails(client: TmdbClient, raw: TmdbTvDetailsRaw): SeriesDetails {
  const { cast, crew } = normalizeCredits(client, raw.credits)
  const summary = normalizeSummary(client, raw, 'series')!
  const runtime = raw.episode_run_time?.[0] ?? null
  return {
    ...summary,
    type: 'series',
    description: raw.overview || null,
    runtime,
    releaseDate: raw.first_air_date ?? null,
    status: raw.status ?? null,
    numberOfSeasons: raw.number_of_seasons ?? 0,
    numberOfEpisodes: raw.number_of_episodes ?? 0,
    genres: (raw.genres ?? []).map((g) => g.name),
    cast,
    crew,
    trailers: normalizeTrailers(raw.videos),
    seasons: normalizeSeasons(client, raw.seasons),
    recommendations: normalizeSummaries(client, raw.recommendations?.results, 'series'),
    stream: { tvPathTemplate: `/v1/tv/${raw.id}/seasons/{s}/episodes/{e}` },
  }
}

export function normalizeSeasonEpisodes(
  client: TmdbClient,
  seriesId: string,
  raw: TmdbSeasonRaw,
): SeasonEpisodesResponse {
  const episodes: EpisodeSummary[] = (raw.episodes ?? []).map((ep) => ({
    id: String(ep.id),
    seasonNumber: ep.season_number ?? raw.season_number,
    episodeNumber: ep.episode_number,
    title: ep.name || `Episode ${ep.episode_number}`,
    description: ep.overview || null,
    airDate: ep.air_date ?? null,
    runtime: ep.runtime ?? null,
    thumbnail: client.imageUrl(ep.still_path, 'w300'),
    rating: typeof ep.vote_average === 'number' ? Math.round(ep.vote_average * 10) / 10 : null,
    streamPath: `/v1/tv/${seriesId}/seasons/${ep.season_number ?? raw.season_number}/episodes/${ep.episode_number}`,
  }))

  return {
    id: String(raw.id ?? `${seriesId}-s${raw.season_number}`),
    seasonNumber: raw.season_number,
    name: raw.name || `Season ${raw.season_number}`,
    description: raw.overview || null,
    poster: client.imageUrl(raw.poster_path, 'w342'),
    airDate: raw.air_date ?? null,
    episodes,
  }
}
