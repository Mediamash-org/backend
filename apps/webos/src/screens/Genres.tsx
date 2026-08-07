import { useEffect, useState } from 'react'
import { fetchGenres, isAbortError } from '../api'
import type { GenreItem, GenresResponse } from '../api/types'
import { ErrorState, LoadingState } from '../components/ErrorState'
import { Focusable } from '../components/Focusable'
import type { Route } from '../navigation/routes'

interface GenresScreenProps {
  onNavigate: (route: Route) => void
}

export function GenresScreen({ onNavigate }: GenresScreenProps) {
  const [data, setData] = useState<GenresResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    fetchGenres(ac.signal)
      .then((res) => {
        if (ac.signal.aborted) return
        setData(res)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (isAbortError(err) || ac.signal.aborted) return
        setError(err.message)
        setLoading(false)
      })
    return () => ac.abort()
  }, [reloadKey])

  const open = (g: GenreItem) => {
    if (g.mediaType === 'movie') onNavigate({ name: 'movies', genre: String(g.id) })
    else onNavigate({ name: 'series', genre: String(g.id) })
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
  if (!data) return null

  return (
    <div className="screen">
      <header className="screen__header">
        <h1>Genres</h1>
      </header>
      <h2 className="section-label">Movies</h2>
      <div className="genre-grid">
        {data.movies.map((g, i) => (
          <Focusable
            key={`m-${g.id}`}
            id={`genre-movie-${g.id}`}
            className="genre-card"
            autoFocus={i === 0}
            onSelect={() => open(g)}
          >
            {g.name}
          </Focusable>
        ))}
      </div>
      <h2 className="section-label">Series</h2>
      <div className="genre-grid">
        {data.series.map((g) => (
          <Focusable
            key={`s-${g.id}`}
            id={`genre-series-${g.id}`}
            className="genre-card"
            onSelect={() => open(g)}
          >
            {g.name}
          </Focusable>
        ))}
      </div>
    </div>
  )
}
