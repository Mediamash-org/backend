import { useEffect, useState } from 'react'
import { fetchSeasonEpisodes, fetchSeriesDetails, isAbortError } from '../api'
import type { EpisodeSummary, SeasonEpisodesResponse, SeriesDetails } from '../api/types'
import { EpisodeCard } from '../components/EpisodeCard'
import { ErrorState, LoadingState } from '../components/ErrorState'
import { Focusable } from '../components/Focusable'
import { MediaRow } from '../components/MediaRow'
import { SeasonSelector } from '../components/SeasonSelector'
import type { Route } from '../navigation/routes'

interface SeriesDetailsScreenProps {
  id: string
  season?: number
  onNavigate: (route: Route) => void
}

export function SeriesDetailsScreen({ id, season, onNavigate }: SeriesDetailsScreenProps) {
  const [data, setData] = useState<SeriesDetails | null>(null)
  const [seasonData, setSeasonData] = useState<SeasonEpisodesResponse | null>(null)
  const [selectedSeason, setSelectedSeason] = useState<number | null>(season ?? null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [epLoading, setEpLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    fetchSeriesDetails(id, ac.signal)
      .then((res) => {
        if (ac.signal.aborted) return
        setData(res)
        const first = season ?? res.seasons[0]?.seasonNumber ?? 1
        setSelectedSeason(first)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (isAbortError(err) || ac.signal.aborted) return
        setError(err.message)
        setLoading(false)
      })
    return () => ac.abort()
  }, [id, season, reloadKey])

  useEffect(() => {
    if (selectedSeason == null) return
    const ac = new AbortController()
    setEpLoading(true)
    fetchSeasonEpisodes(id, selectedSeason, ac.signal)
      .then((res) => {
        if (ac.signal.aborted) return
        setSeasonData(res)
        setEpLoading(false)
      })
      .catch((err: Error) => {
        if (isAbortError(err) || ac.signal.aborted) return
        setEpLoading(false)
      })
    return () => ac.abort()
  }, [id, selectedSeason])

  const playEpisode = (ep: EpisodeSummary) => {
    onNavigate({
      name: 'player',
      kind: 'episode',
      id,
      season: ep.seasonNumber,
      episode: ep.episodeNumber,
      title: `${data?.title ?? 'Series'} · S${ep.seasonNumber}E${ep.episodeNumber}`,
      streamPath: ep.streamPath,
    })
  }

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
          {data.poster && <img className="details-poster" src={data.poster} alt="" />}
          <div className="details-copy">
            <h1>{data.title}</h1>
            <p className="details-meta">
              {[
                data.year,
                data.numberOfSeasons ? `${data.numberOfSeasons} seasons` : null,
                data.rating != null ? `★ ${data.rating.toFixed(1)}` : null,
                data.genres?.join(' · '),
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </p>
            {data.description && <p className="details-desc">{data.description}</p>}
            <div className="hero__actions">
              <Focusable
                id="series-watch"
                className="btn btn--play"
                autoFocus
                onSelect={() => {
                  const ep = seasonData?.episodes[0]
                  if (ep) playEpisode(ep)
                }}
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

      <section className="episodes-section">
        <h2>Episodes</h2>
        <SeasonSelector
          seasons={data.seasons}
          selected={selectedSeason ?? data.seasons[0]?.seasonNumber ?? 1}
          onSelect={(n) => {
            setSelectedSeason(n)
            onNavigate({ name: 'seriesDetail', id, season: n })
          }}
        />
        {epLoading && <LoadingState label="Loading episodes…" />}
        {!epLoading && seasonData && (
          <div className="episode-list">
            {seasonData.episodes.map((ep, i) => (
              <EpisodeCard
                key={ep.id}
                episode={ep}
                focusId={`ep-${ep.seasonNumber}-${ep.episodeNumber}`}
                autoFocus={i === 0}
                onSelect={playEpisode}
              />
            ))}
          </div>
        )}
      </section>

      {data.recommendations.length > 0 && (
        <MediaRow
          title="More Like This"
          items={data.recommendations}
          rowId="series-recs"
          onSelect={(item) => {
            if (item.type === 'movie') onNavigate({ name: 'movie', id: item.id })
            else onNavigate({ name: 'seriesDetail', id: item.id })
          }}
        />
      )}
    </div>
  )
}
