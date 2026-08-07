import { useCallback, useEffect, useState } from 'react'
import { parseHash, toHash, type Route } from './routes'

const focusStack = new Map<string, string>()

export function saveFocusKey(routeKey: string, focusId: string) {
  focusStack.set(routeKey, focusId)
}

export function takeFocusKey(routeKey: string): string | undefined {
  return focusStack.get(routeKey)
}

export function routeKey(route: Route): string {
  return toHash(route)
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash || '#/'))

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash || '#/'))
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) window.location.hash = '#/'
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((next: Route, replace = false) => {
    const hash = toHash(next)
    if (replace) {
      window.location.replace(`${window.location.pathname}${window.location.search}${hash}`)
    } else {
      window.location.hash = hash
    }
  }, [])

  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back()
    else navigate({ name: 'home' }, true)
  }, [navigate])

  return { route, navigate, back }
}
