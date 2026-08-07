import type { EpisodeSummary } from '../api/types'
import { Focusable } from './Focusable'

interface EpisodeCardProps {
  episode: EpisodeSummary
  focusId: string
  onSelect: (episode: EpisodeSummary) => void
  autoFocus?: boolean
}

export function EpisodeCard({ episode, focusId, onSelect, autoFocus }: EpisodeCardProps) {
  return (
    <Focusable
      id={focusId}
      className="episode-card"
      autoFocus={autoFocus}
      onSelect={() => onSelect(episode)}
    >
      <div className="episode-card__thumb">
        {episode.thumbnail ? (
          <img src={episode.thumbnail} alt="" loading="lazy" />
        ) : (
          <div className="episode-card__placeholder">E{episode.episodeNumber}</div>
        )}
      </div>
      <div className="episode-card__body">
        <div className="episode-card__title">
          {episode.episodeNumber}. {episode.title}
        </div>
        <div className="episode-card__meta">
          {[episode.airDate, episode.runtime != null ? `${episode.runtime}m` : null, episode.rating != null ? `★ ${episode.rating}` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
        {episode.description && <p className="episode-card__desc">{episode.description}</p>}
      </div>
    </Focusable>
  )
}
