import { useEffect, useRef, useState } from 'react'
import { fetchHome, isAbortError } from '../api'
import type { HomeResponse, MediaSummary } from '../api/types'
import { ErrorState, LoadingState } from '../components/ErrorState'
import { Hero } from '../components/Hero'
import { MediaRow } from '../components/MediaRow'
import type { Route } from '../navigation/routes'
import { routeKey, saveFocusKey, takeFocusKey } from '../navigation/useRouter'

interface HomeScreenProps {
  onNavigate: (route: Route) => void
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const [data, setData] = useState<HomeResponse | null>(null)
  const [featured, setFeatured] = useState<MediaSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const focusRef = useRef(takeFocusKey(routeKey({ name: 'home' })))

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    fetchHome(ac.signal)
      .then((res) => {
        if (ac.signal.aborted) return
        setData(res)
        setFeatured(res.hero)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (isAbortError(err) || ac.signal.aborted) return
        setError(err.message || 'Unable to load content.')
        setLoading(false)
      })
    return () => ac.abort()
  }, [])

  const retry = () => {
    setLoading(true)
    setError(null)
    fetchHome()
      .then((res) => {
        setData(res)
        setFeatured(res.hero)
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message || 'Unable to load content.')
        setLoading(false)
      })
  }

  const openItem = (item: MediaSummary, focusId: string) => {
    saveFocusKey(routeKey({ name: 'home' }), focusId)
    if (item.type === 'movie') onNavigate({ name: 'movie', id: item.id })
    else onNavigate({ name: 'seriesDetail', id: item.id })
  }

  if (loading) return <LoadingState label="Loading home…" />
  if (error) return <ErrorState message={error} onRetry={retry} />
  if (!data) return <ErrorState message="Unable to load content." onRetry={retry} />

  const hero = featured ?? data.hero

  return (
    <div className="screen screen--home">
      {hero && (
        <Hero
          item={hero}
          autoFocusPlay={!focusRef.current}
          onPlay={() => {
            if (hero.type === 'movie') {
              onNavigate({ name: 'player', kind: 'movie', id: hero.id, title: hero.title })
            } else {
              onNavigate({ name: 'seriesDetail', id: hero.id })
            }
          }}
          onDetails={() => openItem(hero, 'hero-details')}
        />
      )}
      <div className="screen__body screen__body--overlap">
        {data.sections.map((section) => (
          <MediaRow
            key={section.id}
            title={section.title}
            items={section.items}
            rowId={`home-${section.id}`}
            ranked={section.id === 'trending'}
            restoreFocusId={focusRef.current}
            onSelect={(item) => openItem(item, `home-${section.id}-${item.type}-${item.id}`)}
            onFocusItem={(item, focusId) => {
              setFeatured(item)
              saveFocusKey(routeKey({ name: 'home' }), focusId)
            }}
          />
        ))}
      </div>
    </div>
  )
}
