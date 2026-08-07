export interface UserProfile {
  id: string
  name: string
  /** CSS color for avatar */
  color: string
  createdAt: string
}

export interface AppPreferences {
  /** Automatically start the next episode when one ends */
  autoplayNext: boolean
  /** Play the splash jingle on launch */
  splashSound: boolean
  /** Preferred subtitle language code, or 'off' / 'auto' */
  preferredSubtitle: 'off' | 'auto' | 'en' | 'es' | 'fr' | 'hi' | 'de' | 'ja' | 'ko'
}

export interface SessionState {
  onboarded: boolean
  apiBaseUrl: string
  users: UserProfile[]
  activeUserId: string | null
  preferences: AppPreferences
}

const STORAGE_KEY = 'omss.webos.session'
const AVATAR_COLORS = ['#e50914', '#46d369', '#3d8bfd', '#f5c518', '#a855f7', '#f97316', '#14b8a6', '#ec4899']

export const DEFAULT_PREFERENCES: AppPreferences = {
  autoplayNext: true,
  splashSound: true,
  preferredSubtitle: 'auto',
}

function defaultBase(): string {
  return ((import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:3000').replace(
    /\/$/,
    '',
  )
}

function uid(): string {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizePreferences(raw: unknown): AppPreferences {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppPreferences>
  return {
    autoplayNext: p.autoplayNext !== false,
    splashSound: p.splashSound !== false,
    preferredSubtitle: (p.preferredSubtitle as AppPreferences['preferredSubtitle']) || 'auto',
  }
}

export function createDefaultSession(): SessionState {
  return {
    onboarded: false,
    apiBaseUrl: defaultBase(),
    users: [],
    activeUserId: null,
    preferences: { ...DEFAULT_PREFERENCES },
  }
}

function loadLegacyApiBase(): string | null {
  try {
    const raw = localStorage.getItem('omss.webos.settings')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { apiBaseUrl?: string }
    return parsed.apiBaseUrl?.replace(/\/$/, '') || null
  } catch {
    return null
  }
}

export function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const legacy = loadLegacyApiBase()
      const base = createDefaultSession()
      if (legacy) base.apiBaseUrl = legacy
      return base
    }
    const parsed = JSON.parse(raw) as Partial<SessionState>
    return {
      onboarded: Boolean(parsed.onboarded),
      apiBaseUrl: (parsed.apiBaseUrl || loadLegacyApiBase() || defaultBase()).replace(/\/$/, ''),
      users: Array.isArray(parsed.users) ? parsed.users : [],
      activeUserId: parsed.activeUserId ?? null,
      preferences: normalizePreferences(parsed.preferences),
    }
  } catch {
    return createDefaultSession()
  }
}

export function saveSession(session: SessionState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function nextAvatarColor(users: UserProfile[]): string {
  return AVATAR_COLORS[users.length % AVATAR_COLORS.length]
}

export function createUser(name: string, users: UserProfile[]): UserProfile {
  return {
    id: uid(),
    name: name.trim() || `Profile ${users.length + 1}`,
    color: nextAvatarColor(users),
    createdAt: new Date().toISOString(),
  }
}

export { AVATAR_COLORS, defaultBase }
