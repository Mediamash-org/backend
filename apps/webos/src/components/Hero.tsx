import type { MediaSummary } from '../api/types'
import { Focusable } from './Focusable'

interface HeroProps {
  item: MediaSummary
  onPlay: () => void
  onDetails: () => void
  autoFocusPlay?: boolean
}

export function Hero({ item, onPlay, onDetails, autoFocusPlay }: HeroProps) {
  const match = item.rating != null ? Math.round(item.rating * 10) : null

  return (
    <section className="hero">
      <div
        className="hero__backdrop"
        style={item.backdrop ? { backgroundImage: `url(${item.backdrop})` } : undefined}
      />
      <div className="hero__vignette" />
      <div className="hero__content">
        <div className="hero__badge-row">
          <span className="hero__brand-tag">OMSS Originals</span>
          <span className="hero__type-tag">{item.type === 'movie' ? 'Film' : 'Series'}</span>
        </div>
        <h1 className="hero__title">{item.title}</h1>
        <div className="hero__meta">
          {match != null && <span className="hero__match">{match}% Match</span>}
          {item.year != null && <span className="hero__pill">{item.year}</span>}
          {item.rating != null && <span className="hero__pill">★ {item.rating.toFixed(1)}</span>}
          {item.genres?.slice(0, 3).map((g) => (
            <span key={g} className="hero__pill hero__pill--ghost">
              {g}
            </span>
          ))}
        </div>
        {item.description && <p className="hero__desc">{item.description}</p>}
        <div className="hero__actions">
          <Focusable
            id="hero-play"
            className="btn btn--play"
            onSelect={onPlay}
            autoFocus={autoFocusPlay}
          >
            <span className="btn__icon" aria-hidden="true">
              ▶
            </span>
            Play
          </Focusable>
          <Focusable id="hero-details" className="btn btn--info" onSelect={onDetails}>
            <span className="btn__icon" aria-hidden="true">
              ⓘ
            </span>
            More Info
          </Focusable>
        </div>
      </div>
    </section>
  )
}
