import { useCallback, useEffect, useState } from 'react'
import { SideNav } from './components/SideNav'
import {
  directionFromKey,
  focusFirstIn,
  getFocusables,
  isBackKey,
  isSelectKey,
  moveFocus,
} from './navigation/spatialNav'
import { useRouter } from './navigation/useRouter'
import { GenresScreen } from './screens/Genres'
import { HomeScreen } from './screens/Home'
import { MovieDetailsScreen } from './screens/MovieDetails'
import { MoviesScreen } from './screens/Movies'
import { OnboardingScreen } from './screens/Onboarding'
import { PlayerScreen } from './screens/Player'
import { SearchScreen } from './screens/Search'
import { SeriesScreen } from './screens/Series'
import { SeriesDetailsScreen } from './screens/SeriesDetails'
import { SettingsScreen } from './screens/Settings'
import { SplashScreen } from './screens/Splash'
import { useSession } from './store/SessionContext'
import './styles/tv.css'

export default function App() {
  const { route, navigate, back } = useRouter()
  const { session, activeUser } = useSession()
  const [showSplash, setShowSplash] = useState(true)
  const hideNav = route.name === 'player'

  const needsSetup = !session.onboarded || session.users.length === 0
  const needsProfile = session.onboarded && session.users.length > 0 && !activeUser
  const inGate = showSplash || needsSetup || needsProfile

  const finishSplash = useCallback(() => setShowSplash(false), [])

  useEffect(() => {
    document.body.classList.add('tv-ui')
    return () => document.body.classList.remove('tv-ui')
  }, [])

  useEffect(() => {
    if (inGate) return
    const onKey = (e: KeyboardEvent) => {
      if (route.name === 'player') return

      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA'

      if (isBackKey(e)) {
        if (inField) return
        e.preventDefault()
        if (route.name !== 'home') back()
        else focusFirstIn('.side-nav')
        return
      }

      if (inField) {
        const direction = directionFromKey(e)
        if (direction === 'up' || direction === 'down') {
          e.preventDefault()
          const wrap = target?.closest('.focusable')
          if (wrap instanceof HTMLElement) wrap.focus()
          moveFocus(direction)
        }
        return
      }

      const direction = directionFromKey(e)
      if (direction) {
        const active = document.activeElement
        const onFocusable =
          active instanceof HTMLElement &&
          (active.classList.contains('focusable') || Boolean(active.closest('.focusable')))
        if (!onFocusable) {
          e.preventDefault()
          getFocusables()[0]?.focus()
          return
        }
        if (!(active instanceof HTMLElement && active.classList.contains('focusable'))) {
          e.preventDefault()
          moveFocus(direction)
        }
      }

      if (isSelectKey(e) && target && !target.classList.contains('focusable')) {
        const parent = target.closest('.focusable')
        if (parent instanceof HTMLElement) {
          e.preventDefault()
          parent.click()
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [route.name, back, inGate])

  useEffect(() => {
    if (hideNav || inGate) return
    const t = window.setTimeout(() => {
      const active = document.activeElement
      if (active instanceof HTMLElement && active.classList.contains('focusable')) return
      if (active instanceof HTMLElement && active.closest('.focusable')) return
      const preferred =
        document.getElementById('hero-play') ||
        document.querySelector<HTMLElement>('.app-main .focusable') ||
        document.querySelector<HTMLElement>('.side-nav .focusable')
      preferred?.focus()
    }, 80)
    return () => window.clearTimeout(t)
  }, [route, hideNav, inGate])

  if (showSplash) {
    return <SplashScreen onDone={finishSplash} />
  }

  if (needsSetup) {
    return <OnboardingScreen mode="setup" />
  }

  if (needsProfile) {
    return <OnboardingScreen mode="profiles" />
  }

  return (
    <div className={`app-shell${hideNav ? ' app-shell--player' : ''}`}>
      {!hideNav && <SideNav active={route.name} onNavigate={navigate} />}
      <main className={`app-main${hideNav ? ' app-main--player' : ''}`} data-nav-zone="main">
        {route.name === 'home' && <HomeScreen onNavigate={navigate} />}
        {route.name === 'movies' && (
          <MoviesScreen genre={route.genre} category={route.category} onNavigate={navigate} />
        )}
        {route.name === 'series' && (
          <SeriesScreen genre={route.genre} category={route.category} onNavigate={navigate} />
        )}
        {route.name === 'genres' && <GenresScreen onNavigate={navigate} />}
        {route.name === 'search' && <SearchScreen onNavigate={navigate} />}
        {route.name === 'movie' && <MovieDetailsScreen id={route.id} onNavigate={navigate} />}
        {route.name === 'seriesDetail' && (
          <SeriesDetailsScreen id={route.id} season={route.season} onNavigate={navigate} />
        )}
        {route.name === 'settings' && <SettingsScreen />}
        {route.name === 'player' && (
          <PlayerScreen
            kind={route.kind}
            id={route.id}
            title={route.title}
            season={route.kind === 'episode' ? route.season : undefined}
            episode={route.kind === 'episode' ? route.episode : undefined}
            streamPath={route.kind === 'episode' ? route.streamPath : undefined}
            onBack={back}
            onNavigate={navigate}
          />
        )}
      </main>
    </div>
  )
}
