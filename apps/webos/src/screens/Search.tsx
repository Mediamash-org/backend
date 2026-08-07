import { useEffect, useRef, useState } from 'react'
import { isAbortError, searchContent } from '../api'
import type { MediaSummary, SearchResponse } from '../api/types'
import { ErrorState, LoadingState } from '../components/ErrorState'
import { Focusable } from '../components/Focusable'
import { MediaGrid } from '../components/MediaGrid'
import type { Route } from '../navigation/routes'

interface SearchScreenProps {
  onNavigate: (route: Route) => void
}

export function SearchScreen({ onNavigate }: SearchScreenProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [data, setData] = useState<SearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 400)
    return () => window.clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!debounced) {
      setData(null)
      setError(null)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    searchContent(debounced, 1, ac.signal)
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
  }, [debounced])

  const open = (item: MediaSummary) => {
    if (item.type === 'movie') onNavigate({ name: 'movie', id: item.id })
    else onNavigate({ name: 'seriesDetail', id: item.id })
  }

  return (
    <div className="screen">
      <header className="screen__header">
        <h1>Search</h1>
      </header>
      <Focusable
        id="search-input-wrap"
        className="search-box"
        autoFocus
        onSelect={() => inputRef.current?.focus()}
        onFocus={() => {
          // Keep remote focus on the wrapper; OK enters the field
        }}
      >
        <input
          ref={inputRef}
          id="search-input"
          className="search-input"
          placeholder="Press OK to type · search movies and series"
          value={query}
          tabIndex={-1}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              document.getElementById('search-input-wrap')?.focus()
            }
          }}
        />
      </Focusable>
      {loading && <LoadingState label="Searching…" />}
      {error && <ErrorState message={error} onRetry={() => setDebounced(query.trim())} />}
      {!loading && !error && debounced && data && (
        <>
          <p className="muted">
            {data.totalResults} result{data.totalResults === 1 ? '' : 's'} for “{data.query}”
          </p>
          <MediaGrid items={data.items} gridId="search" onSelect={open} />
        </>
      )}
      {!debounced && <p className="muted">Press OK on the search box, then type with the remote keyboard.</p>}
    </div>
  )
}
