import { useEffect, useRef, useState } from 'react'
import { fetchSeries, isAbortError } from '../api'
import {
  CATALOG_LIMIT,
  chunkIntoRails,
  fetchCatalogPages,
  limitCatalog,
  type CatalogRail,
} from '../api/catalog'
import type { MediaSummary } from '../api/types'
import { ErrorState, LoadingState } from '../components/ErrorState'
import { Focusable } from '../components/Focusable'
import { MediaRow } from '../components/MediaRow'
import type { Route } from '../navigation/routes'
import { routeKey, saveFocusKey, takeFocusKey } from '../navigation/useRouter'

const SERIES_RAIL_LABELS = [
  'Popular Series',
  'Must Watch',
  'More Series',
  'Fan Favorites',
  'Worth Bingeing',
]

interface SeriesScreenProps {
  genre?: string
  category?: string
  onNavigate: (route: Route) => void
}

export function SeriesScreen({ genre, onNavigate }: SeriesScreenProps) {
  const [rails, setRails] = useState<CatalogRail[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const rk = routeKey({ name: 'series', genre })
  const focusRef = useRef(takeFocusKey(rk))

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    const load = genre
      ? fetchCatalogPages(
          (page, signal) => fetchSeries({ genre, page }, signal),
          ac.signal,
          CATALOG_LIMIT,
        )
      : fetchCatalogPages(
          (page, signal) => fetchSeries({ category: 'popular', page }, signal),
          ac.signal,
          CATALOG_LIMIT,
        )

    load
      .then((items) => {
        if (ac.signal.aborted) return
        const capped = limitCatalog(items, CATALOG_LIMIT)
        setRails(
          chunkIntoRails(
            capped,
            genre ? ['In This Genre', 'More In Genre', 'Even More'] : SERIES_RAIL_LABELS,
          ),
        )
        setLoading(false)
      })
      .catch((err: Error) => {
        if (isAbortError(err) || ac.signal.aborted) return
        setError(err.message)
        setLoading(false)
      })

    return () => ac.abort()
  }, [genre, reloadKey])

  const open = (item: MediaSummary, focusId: string) => {
    saveFocusKey(rk, focusId)
    onNavigate({ name: 'seriesDetail', id: item.id })
  }

  const total = rails.reduce((sum, r) => sum + r.items.length, 0)

  return (
    <div className="screen screen--catalog">
      <header className="catalog-header">
        <p className="catalog-header__eyebrow">Series</p>
        <h1>{genre ? 'Genre Collection' : 'Series'}</h1>
        <p className="catalog-header__sub">
          Showing {total || CATALOG_LIMIT} titles on this screen. Use Search to find anything else.
        </p>
        <div className="catalog-header__actions chip-row">
          <Focusable
            id="series-jump-search"
            className="chip chip--lg chip--accent"
            autoFocus={!focusRef.current}
            onSelect={() => onNavigate({ name: 'search' })}
          >
            Search All Series
          </Focusable>
          <Focusable
            id="series-jump-genres"
            className="chip chip--lg"
            onSelect={() => onNavigate({ name: 'genres' })}
          >
            Genres
          </Focusable>
        </div>
      </header>

      {loading && <LoadingState label="Loading series…" />}
      {error && <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />}

      {!loading && !error && (
        <div className="catalog-rails">
          {rails.map((rail, index) => (
            <MediaRow
              key={rail.id}
              title={rail.title}
              items={rail.items}
              rowId={`series-${rail.id}`}
              size="lg"
              ranked={index === 0 && !genre}
              restoreFocusId={index === 0 ? focusRef.current : undefined}
              onSelect={(item) => open(item, `series-${rail.id}-${item.type}-${item.id}`)}
              onFocusItem={(_i, id) => saveFocusKey(rk, id)}
            />
          ))}
          <div className="catalog-footer">
            <p className="muted">Looking for something else?</p>
            <Focusable
              id="series-footer-search"
              className="btn btn--play"
              onSelect={() => onNavigate({ name: 'search' })}
            >
              Open Search
            </Focusable>
          </div>
        </div>
      )}
    </div>
  )
}
