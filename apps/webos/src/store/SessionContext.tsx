import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { setApiBaseUrl } from '../api/client'
import {
  createDefaultSession,
  createUser,
  loadSession,
  saveSession,
  type AppPreferences,
  type SessionState,
  type UserProfile,
} from './session'

interface SessionContextValue {
  session: SessionState
  activeUser: UserProfile | null
  setServerUrl: (url: string) => void
  completeOnboarding: (serverUrl: string, firstUserName: string) => void
  addUser: (name: string) => UserProfile
  selectUser: (id: string) => void
  removeUser: (id: string) => void
  signOutProfile: () => void
  resetOnboarding: () => void
  updatePreferences: (patch: Partial<AppPreferences>) => void
  clearLocalData: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>(() => {
    const initial = loadSession()
    setApiBaseUrl(initial.apiBaseUrl)
    return initial
  })

  const commit = useCallback((next: SessionState) => {
    setApiBaseUrl(next.apiBaseUrl)
    saveSession(next)
    setSession(next)
  }, [])

  const setServerUrl = useCallback(
    (url: string) => {
      commit({ ...session, apiBaseUrl: url.replace(/\/$/, '') })
    },
    [commit, session],
  )

  const completeOnboarding = useCallback(
    (serverUrl: string, firstUserName: string) => {
      const user = createUser(firstUserName, [])
      commit({
        onboarded: true,
        apiBaseUrl: serverUrl.replace(/\/$/, ''),
        users: [user],
        activeUserId: user.id,
        preferences: session.preferences,
      })
    },
    [commit, session.preferences],
  )

  const addUser = useCallback(
    (name: string) => {
      const user = createUser(name, session.users)
      commit({
        ...session,
        users: [...session.users, user],
        activeUserId: user.id,
      })
      return user
    },
    [commit, session],
  )

  const selectUser = useCallback(
    (id: string) => {
      if (!session.users.some((u) => u.id === id)) return
      commit({ ...session, activeUserId: id })
    },
    [commit, session],
  )

  const removeUser = useCallback(
    (id: string) => {
      const users = session.users.filter((u) => u.id !== id)
      const activeUserId =
        session.activeUserId === id ? users[0]?.id ?? null : session.activeUserId
      commit({ ...session, users, activeUserId })
    },
    [commit, session],
  )

  const signOutProfile = useCallback(() => {
    commit({ ...session, activeUserId: null })
  }, [commit, session])

  const resetOnboarding = useCallback(() => {
    commit({
      ...session,
      onboarded: false,
      users: [],
      activeUserId: null,
    })
  }, [commit, session])

  const updatePreferences = useCallback(
    (patch: Partial<AppPreferences>) => {
      commit({
        ...session,
        preferences: { ...session.preferences, ...patch },
      })
    },
    [commit, session],
  )

  const clearLocalData = useCallback(() => {
    const fresh = createDefaultSession()
    fresh.apiBaseUrl = session.apiBaseUrl
    commit(fresh)
  }, [commit, session.apiBaseUrl])

  const activeUser = useMemo(
    () => session.users.find((u) => u.id === session.activeUserId) ?? null,
    [session.activeUserId, session.users],
  )

  const value = useMemo(
    () => ({
      session,
      activeUser,
      setServerUrl,
      completeOnboarding,
      addUser,
      selectUser,
      removeUser,
      signOutProfile,
      resetOnboarding,
      updatePreferences,
      clearLocalData,
    }),
    [
      session,
      activeUser,
      setServerUrl,
      completeOnboarding,
      addUser,
      selectUser,
      removeUser,
      signOutProfile,
      resetOnboarding,
      updatePreferences,
      clearLocalData,
    ],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
