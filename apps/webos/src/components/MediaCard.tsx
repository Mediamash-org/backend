import type { MediaSummary } from '../api/types'
import { Focusable } from './Focusable'

interface MediaCardProps {
  item: MediaSummary
  focusId: string
  onSelect: (item: MediaSummary) => void
  onFocus?: (item: MediaSummary) => void
  autoFocus?: boolean
  rank?: number
  size?: 'md' | 'lg'
}

export function MediaCard({
  item,
  focusId,
  onSelect,
  onFocus,
  autoFocus,
  rank,
  size = 'md',
}: MediaCardProps) {
  return (
    <Focusable
      id={focusId}
      className={`media-card media-card--${size}${rank != null ? ' media-card--ranked' : ''}`}
      autoFocus={autoFocus}
      onSelect={() => onSelect(item)}
      onFocus={() => onFocus?.(item)}
    >
      {rank != null && (
        <span className="media-card__rank" aria-hidden="true">
          {rank}
        </span>
      )}
      <div className="media-card__body">
        <div className="media-card__poster">
          {item.poster ? (
            <img src={item.poster} alt="" loading="lazy" decoding="async" />
          ) : (
            <div className="media-card__placeholder">{item.title.slice(0, 1)}</div>
          )}
          <div className="media-card__overlay">
            <div className="media-card__title">{item.title}</div>
            <div className="media-card__sub">
              {[item.year, item.rating != null ? `★ ${item.rating.toFixed(1)}` : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </div>
      </div>
    </Focusable>
  )
}
