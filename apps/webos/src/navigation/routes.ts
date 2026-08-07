export type ScreenName =
  | 'home'
  | 'movies'
  | 'series'
  | 'genres'
  | 'search'
  | 'movie'
  | 'seriesDetail'
  | 'player'
  | 'settings'

export type Route =
  | { name: 'home' }
  | { name: 'movies'; genre?: string; category?: string }
  | { name: 'series'; genre?: string; category?: string }
  | { name: 'genres' }
  | { name: 'search' }
  | { name: 'movie'; id: string }
  | { name: 'seriesDetail'; id: string; season?: number }
  | { name: 'player'; kind: 'movie'; id: string; title: string }
  | { name: 'player'; kind: 'episode'; id: string; season: number; episode: number; title: string; streamPath?: string }
  | { name: 'settings' }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const params = new URLSearchParams(query)
  const parts = path.split('/').filter(Boolean)

  if (parts[0] === 'movies') {
    return {
      name: 'movies',
      genre: params.get('genre') || undefined,
      category: params.get('category') || undefined,
    }
  }
  if (parts[0] === 'series' && parts[1]) {
    const season = params.get('season')
    return {
      name: 'seriesDetail',
      id: parts[1],
      season: season ? Number(season) : undefined,
    }
  }
  if (parts[0] === 'series') {
    return {
      name: 'series',
      genre: params.get('genre') || undefined,
      category: params.get('category') || undefined,
    }
  }
  if (parts[0] === 'genres') return { name: 'genres' }
  if (parts[0] === 'search') return { name: 'search' }
  if (parts[0] === 'movie' && parts[1]) return { name: 'movie', id: parts[1] }
  if (parts[0] === 'settings') return { name: 'settings' }
  if (parts[0] === 'player') {
    const kind = params.get('kind')
    const id = params.get('id') || ''
    const title = params.get('title') || 'Playback'
    if (kind === 'episode') {
      return {
        name: 'player',
        kind: 'episode',
        id,
        season: Number(params.get('season') || 1),
        episode: Number(params.get('episode') || 1),
        title,
        streamPath: params.get('streamPath') || undefined,
      }
    }
    return { name: 'player', kind: 'movie', id, title }
  }
  return { name: 'home' }
}

export function toHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'movies': {
      const q = new URLSearchParams()
      if (route.genre) q.set('genre', route.genre)
      if (route.category) q.set('category', route.category)
      const s = q.toString()
      return `#/movies${s ? `?${s}` : ''}`
    }
    case 'series': {
      const q = new URLSearchParams()
      if (route.genre) q.set('genre', route.genre)
      if (route.category) q.set('category', route.category)
      const s = q.toString()
      return `#/series${s ? `?${s}` : ''}`
    }
    case 'genres':
      return '#/genres'
    case 'search':
      return '#/search'
    case 'movie':
      return `#/movie/${route.id}`
    case 'seriesDetail': {
      const q = route.season != null ? `?season=${route.season}` : ''
      return `#/series/${route.id}${q}`
    }
    case 'settings':
      return '#/settings'
    case 'player': {
      const q = new URLSearchParams()
      q.set('kind', route.kind)
      q.set('id', route.id)
      q.set('title', route.title)
      if (route.kind === 'episode') {
        q.set('season', String(route.season))
        q.set('episode', String(route.episode))
        if (route.streamPath) q.set('streamPath', route.streamPath)
      }
      return `#/player?${q.toString()}`
    }
  }
}
