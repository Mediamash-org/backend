export type MediaType = 'movie' | 'series'

export interface MediaSummary {
  id: string
  type: MediaType
  title: string
  poster: string | null
  backdrop: string | null
  year: number | null
  rating: number | null
  genres?: string[]
  description?: string | null
}

export interface PersonCredit {
  id: string
  name: string
  role: string
  photo: string | null
}

export interface TrailerInfo {
  key: string
  name: string
  site: string
  type: string
  url: string
}

export interface SeasonSummary {
  seasonNumber: number
  name: string
  episodeCount: number
  poster: string | null
  airDate: string | null
  description: string | null
}

export interface EpisodeSummary {
  id: string
  seasonNumber: number
  episodeNumber: number
  title: string
  description: string | null
  airDate: string | null
  runtime: number | null
  thumbnail: string | null
  rating: number | null
  streamPath: string
}

export interface MovieDetails extends MediaSummary {
  type: 'movie'
  description: string | null
  runtime: number | null
  releaseDate: string | null
  cast: PersonCredit[]
  crew: PersonCredit[]
  trailers: TrailerInfo[]
  recommendations: MediaSummary[]
  stream: { moviePath: string }
}

export interface SeriesDetails extends MediaSummary {
  type: 'series'
  description: string | null
  runtime: number | null
  releaseDate: string | null
  status: string | null
  numberOfSeasons: number
  numberOfEpisodes: number
  cast: PersonCredit[]
  crew: PersonCredit[]
  trailers: TrailerInfo[]
  seasons: SeasonSummary[]
  recommendations: MediaSummary[]
  stream: { tvPathTemplate: string }
}

export interface GenreItem {
  id: number
  name: string
  mediaType: MediaType
}

export interface HomeSection {
  id: string
  title: string
  type: 'carousel'
  items: MediaSummary[]
}

export interface HomeResponse {
  hero: MediaSummary | null
  sections: HomeSection[]
}

export interface PaginatedMedia {
  page: number
  totalPages: number
  totalResults: number
  items: MediaSummary[]
}

export interface SearchResponse {
  query: string
  page: number
  totalPages: number
  totalResults: number
  items: MediaSummary[]
}

export interface GenresResponse {
  movies: GenreItem[]
  series: GenreItem[]
}

export interface SeasonEpisodesResponse {
  id: string
  seasonNumber: number
  name: string
  description: string | null
  poster: string | null
  airDate: string | null
  episodes: EpisodeSummary[]
}
