import type { SeasonSummary } from '../api/types'
import { Focusable } from './Focusable'

interface SeasonSelectorProps {
  seasons: SeasonSummary[]
  selected: number
  onSelect: (seasonNumber: number) => void
}

export function SeasonSelector({ seasons, selected, onSelect }: SeasonSelectorProps) {
  return (
    <div className="season-selector">
      {seasons.map((s, index) => (
        <Focusable
          key={s.seasonNumber}
          id={`season-${s.seasonNumber}`}
          className={`season-chip${selected === s.seasonNumber ? ' is-active' : ''}`}
          autoFocus={selected === s.seasonNumber || (index === 0 && selected == null)}
          onSelect={() => onSelect(s.seasonNumber)}
        >
          {s.name}
        </Focusable>
      ))}
    </div>
  )
}
