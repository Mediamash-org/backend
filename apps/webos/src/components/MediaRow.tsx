import { useRef } from 'react'
import type { MediaSummary } from '../api/types'
import { MediaCard } from './MediaCard'

interface MediaRowProps {
  title: string
  items: MediaSummary[]
  rowId: string
  onSelect: (item: MediaSummary) => void
  onFocusItem?: (item: MediaSummary, focusId: string) => void
  restoreFocusId?: string
  ranked?: boolean
  /** Large tiles for catalog / 10-foot rails */
  size?: 'md' | 'lg'
}

export function MediaRow({
  title,
  items,
  rowId,
  onSelect,
  onFocusItem,
  restoreFocusId,
  ranked,
  size = 'md',
}: MediaRowProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const list = ranked ? items.slice(0, 10) : items

  if (!list.length) return null

  return (
    <section className={`media-row media-row--${size}${ranked ? ' media-row--ranked' : ''}`}>
      <div className="media-row__header">
        <h2 className="media-row__title">{title}</h2>
        {ranked && <span className="media-row__tag">Top 10</span>}
      </div>
      <div
        className="media-row__scroller"
        ref={scroller}
        onFocus={(e) => {
          const target = e.target as HTMLElement
          target.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
        }}
      >
        {list.map((item, index) => {
          const focusId = `${rowId}-${item.type}-${item.id}`
          return (
            <MediaCard
              key={focusId}
              item={item}
              focusId={focusId}
              size={size}
              rank={ranked ? index + 1 : undefined}
              autoFocus={restoreFocusId === focusId}
              onSelect={onSelect}
              onFocus={(it) => onFocusItem?.(it, focusId)}
            />
          )
        })}
      </div>
    </section>
  )
}
