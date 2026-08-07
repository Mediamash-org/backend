/** webOS / TV platform helpers (safe no-ops in browser). */

export interface WebOsGlobal {
  platformBack?: () => void
  deviceInfo?: { modelName?: string; version?: string; sdkVersion?: string }
  platform?: { tv?: boolean }
}

declare global {
  interface Window {
    webOS?: WebOsGlobal
    PalmSystem?: { platformBack?: () => void; identifier?: string }
  }
}

export function isWebOs(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      (window.webOS ||
        window.PalmSystem ||
        /Web0S|WebOS|LG Browser/i.test(navigator.userAgent)),
  )
}

/** Exit the app (webOS Back-at-root). Falls back to window.close in browser. */
export function platformBack(): void {
  try {
    if (window.webOS?.platformBack) {
      window.webOS.platformBack()
      return
    }
    if (window.PalmSystem?.platformBack) {
      window.PalmSystem.platformBack()
      return
    }
  } catch {
    /* ignore */
  }
  try {
    window.close()
  } catch {
    /* ignore */
  }
}

export type LifecycleHandlers = {
  onHide?: () => void
  onShow?: () => void
  onRelaunch?: (detail?: unknown) => void
}

/** Subscribe to visibility + webOS relaunch. Returns cleanup. */
export function subscribeLifecycle(handlers: LifecycleHandlers): () => void {
  const onVisibility = () => {
    if (document.hidden) handlers.onHide?.()
    else handlers.onShow?.()
  }

  const onRelaunch = (e: Event) => {
    handlers.onRelaunch?.((e as CustomEvent).detail)
  }

  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('webOSRelaunch', onRelaunch as EventListener)
  // Older webOS
  document.addEventListener('webOSLocaleChange', onVisibility as EventListener)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    document.removeEventListener('webOSRelaunch', onRelaunch as EventListener)
    document.removeEventListener('webOSLocaleChange', onVisibility as EventListener)
  }
}

export function getAppVersion(): string {
  return '1.0.0'
}
