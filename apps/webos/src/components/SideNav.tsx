import type { Route } from '../navigation/routes'
import { Focusable } from './Focusable'

const ICONS = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3.2 3.5 10.2V21h6.2v-6.1h4.6V21h6.2V10.2L12 3.2Z"
      />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.5 3.5a7 7 0 0 1 5.5 11.3l4.1 4.1-1.4 1.4-4.1-4.1A7 7 0 1 1 10.5 3.5Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"
      />
    </svg>
  ),
  movies: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13ZM7 7v2h2V7H7Zm0 4v2h2v-2H7Zm0 4v2h2v-2H7Zm4-8h6v10h-6V7Z"
      />
    </svg>
  ),
  series: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v9A1.5 1.5 0 0 1 19.5 17H14l2.2 2.8H7.8L10 17H4.5A1.5 1.5 0 0 1 3 15.5v-9Zm2 .5v8h14V7H5Z"
      />
    </svg>
  ),
  genres: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5h7v7H4V5Zm9 0h7v7h-7V5ZM4 14h7v7H4v-7Zm9 0h7v7h-7v-7Z"
      />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.1 3h3.8l.4 2.2a6.8 6.8 0 0 1 1.7 1l2.1-.9 1.9 3.3-1.7 1.5c.1.4.1.8.1 1.2s0 .8-.1 1.2l1.7 1.5-1.9 3.3-2.1-.9a6.8 6.8 0 0 1-1.7 1L13.9 21h-3.8l-.4-2.2a6.8 6.8 0 0 1-1.7-1l-2.1.9-1.9-3.3 1.7-1.5A6.6 6.6 0 0 1 5.5 12c0-.4 0-.8.1-1.2L3.9 9.3 5.8 6l2.1.9a6.8 6.8 0 0 1 1.7-1L10.1 3ZM12 9.5A2.5 2.5 0 1 0 12 14.5 2.5 2.5 0 0 0 12 9.5Z"
      />
    </svg>
  ),
} as const

type IconKey = keyof typeof ICONS

const ITEMS: Array<{ id: string; label: string; icon: IconKey; route: Route }> = [
  { id: 'nav-home', label: 'Home', icon: 'home', route: { name: 'home' } },
  { id: 'nav-search', label: 'Search', icon: 'search', route: { name: 'search' } },
  { id: 'nav-movies', label: 'Movies', icon: 'movies', route: { name: 'movies' } },
  { id: 'nav-series', label: 'Series', icon: 'series', route: { name: 'series' } },
  { id: 'nav-genres', label: 'Genres', icon: 'genres', route: { name: 'genres' } },
  { id: 'nav-settings', label: 'Settings', icon: 'settings', route: { name: 'settings' } },
]

function isActive(active: string, routeName: Route['name']) {
  if (active === routeName) return true
  if (active === 'movie' && routeName === 'movies') return true
  if (active === 'seriesDetail' && routeName === 'series') return true
  return false
}

interface SideNavProps {
  active: string
  onNavigate: (route: Route) => void
}

export function SideNav({ active, onNavigate }: SideNavProps) {
  return (
    <nav className="side-nav" aria-label="Main" data-nav-zone="sidenav">
      <div className="side-nav__brand" aria-hidden="true">
        <span className="side-nav__wordmark">MEDIAMASH</span>
      </div>
      <div className="side-nav__items" role="list">
        {ITEMS.map((item) => {
          const activeItem = isActive(active, item.route.name)
          return (
            <Focusable
              key={item.id}
              id={item.id}
              className={`side-nav__item${activeItem ? ' is-active' : ''}`}
              dataNavZone="sidenav"
              onSelect={() => onNavigate(item.route)}
            >
              <span className="side-nav__icon">{ICONS[item.icon]}</span>
              <span className="side-nav__label">{item.label}</span>
            </Focusable>
          )
        })}
      </div>
      <p className="side-nav__hint">↑↓ move · OK select · ← content</p>
    </nav>
  )
}
