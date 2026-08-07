import { ApiError } from './types'

const SETTINGS_KEY = 'omss.webos.settings'

export interface AppSettings {
  apiBaseUrl: string
}

function defaultBase(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:3000'
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      if (parsed.apiBaseUrl) return { apiBaseUrl: parsed.apiBaseUrl.replace(/\/$/, '') }
    }
  } catch {
    // ignore
  }
  return { apiBaseUrl: defaultBase().replace(/\/$/, '') }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

let baseUrl = loadSettings().apiBaseUrl

export function getApiBaseUrl(): string {
  return baseUrl
}

export function setApiBaseUrl(url: string): void {
  baseUrl = url.replace(/\/$/, '')
  saveSettings({ apiBaseUrl: baseUrl })
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; code?: number }
  return e.name === 'AbortError' || e.code === 20
}

export { isAbortError }

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
    })
  } catch (err) {
    if (isAbortError(err) || init?.signal?.aborted) {
      throw err instanceof Error ? err : new DOMException('Aborted', 'AbortError')
    }
    throw new ApiError('Unable to reach the server. Check your connection and API address.', 'NETWORK_ERROR', 0)
  }

  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }

  if (!res.ok) {
    const errObj = body as { error?: { code?: string; message?: string } } | null
    throw new ApiError(
      errObj?.error?.message || 'Unable to load content.',
      errObj?.error?.code || 'SERVER_ERROR',
      res.status,
    )
  }

  return body as T
}
