import { useEffect, useState } from 'react'
import { fetchMovie, isAbortError } from '../api'
import type { MovieDetails } from '../api/types'
import { ErrorState, LoadingState } from '../components/ErrorState'
import { Focusable } from '../components/Focusable'
import { MediaRow } from '../components/MediaRow'
import type { Route } from '../navigation/routes'

interface MovieDetailsScreenProps {
  id: string
  onNavigate: (route: Route) => void
}

export function MovieDetailsScreen({ id, onNavigate }: MovieDetailsScreenProps) {
  const [data, setData] = useState<MovieDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    fetchMovie(id, ac.signal)
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
  }, [id, reloadKey])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
  if (!data) return null

  return (
    <div className="screen screen--details">
      <div
        className="details-hero"
        style={data.backdrop ? { backgroundImage: `url(${data.backdrop})` } : undefined}
      >
        <div className="details-hero__shade" />
        <div className="details-hero__inner">
          {data.poster && (
            <img className="details-poster" src={data.poster} alt="" />
          )}
          <div className="details-copy">
            <h1>{data.title}</h1>
            <p className="details-meta">
              {[
                data.year,
                data.runtime != null ? `${data.runtime} min` : null,
                data.rating != null ? `★ ${data.rating.toFixed(1)}` : null,
                data.genres?.join(' · '),
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </p>
            {data.description && <p className="details-desc">{data.description}</p>}
            <div className="hero__actions">
              <Focusable
                id="movie-watch"
                className="btn btn--play"
                autoFocus
                onSelect={() =>
                  onNavigate({ name: 'player', kind: 'movie', id: data.id, title: data.title })
                }
              >
                <span className="btn__icon" aria-hidden="true">
                  ▶
                </span>
                Play
              </Focusable>
            </div>
          </div>
        </div>
      </div>

      {data.cast.length > 0 && (
        <section className="cast-row">
          <h2>Cast</h2>
          <div className="cast-scroller">
            {data.cast.map((c) => (
              <div key={c.id} className="cast-card">
                {c.photo ? <img src={c.photo} alt="" loading="lazy" /> : <div className="cast-ph" />}
                <div className="cast-name">{c.name}</div>
                <div className="cast-role">{c.role}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.recommendations.length > 0 && (
        <MediaRow
          title="More Like This"
          items={data.recommendations}
          rowId="movie-recs"
          onSelect={(item) => {
            if (item.type === 'movie') onNavigate({ name: 'movie', id: item.id })
            else onNavigate({ name: 'seriesDetail', id: item.id })
          }}
        />
      )}
    </div>
  )
}
