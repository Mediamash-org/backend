import type { MediaSummary } from '../api/types'
import { MediaCard } from './MediaCard'

interface MediaGridProps {
  items: MediaSummary[]
  gridId: string
  onSelect: (item: MediaSummary) => void
  onFocusItem?: (item: MediaSummary, focusId: string) => void
  restoreFocusId?: string
}

export function MediaGrid({ items, gridId, onSelect, onFocusItem, restoreFocusId }: MediaGridProps) {
  if (!items.length) {
    return <div className="empty-state">No results.</div>
  }

  return (
    <div className="media-grid">
      {items.map((item, index) => {
        const focusId = `${gridId}-${item.type}-${item.id}`
        return (
          <MediaCard
            key={focusId}
            item={item}
            focusId={focusId}
            size="lg"
            autoFocus={restoreFocusId === focusId || (!restoreFocusId && index === 0)}
            onSelect={onSelect}
            onFocus={(it) => onFocusItem?.(it, focusId)}
          />
        )
      })}
    </div>
  )
}
