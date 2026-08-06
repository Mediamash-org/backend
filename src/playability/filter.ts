export type OmssSource = {
  url?: string
  provider?: { id?: string; name?: string }
  type?: string
}

export type OmssDiagnostic = {
  code?: string
  message?: string
  field?: string
  severity?: string
}

export type ProbeResult = {
  ok: boolean
  reason: string
}

const DEFAULT_PROBE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const playabilityCache = new Map<string, { expiresAt: number; result: ProbeResult }>()

export async function filterPlayableSources(
  sources: OmssSource[],
  origin: string,
  timeoutMs: number,
  cacheTtlMs: number,
): Promise<{ sources: OmssSource[]; removed: number }> {
  const checks = await Promise.all(
    sources.map(async (source) => ({
      source,
      probe: await probePlayableSource(source, origin, timeoutMs, cacheTtlMs),
    })),
  )

  const kept = checks.filter((row) => row.probe.ok).map((row) => row.source)
  return { sources: kept, removed: sources.length - kept.length }
}

export function addPlayableFilterDiagnostic(
  diagnostics: OmssDiagnostic[],
  removed: number,
  code = 'UNPLAYABLE_SOURCE_FILTERED',
  messagePrefix = 'Filtered',
): OmssDiagnostic[] {
  if (removed <= 0) return diagnostics
  return [
    ...diagnostics,
    {
      code,
      severity: 'info',
      field: '',
      message:
        removed === 1
          ? `${messagePrefix} 1 unplayable source after probe`
          : `${messagePrefix} ${removed} unplayable sources after probe`,
    },
  ]
}

export function defaultProbeOrigin(env: NodeJS.ProcessEnv = process.env): string {
  if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/$/, '')
  const host = env.HOST && env.HOST !== '0.0.0.0' ? env.HOST : 'localhost'
  const port = Number(env.PORT ?? 3000)
  return `http://${host}:${port}`
}

async function probePlayableSource(
  source: OmssSource,
  origin: string,
  timeoutMs: number,
  cacheTtlMs: number,
): Promise<ProbeResult> {
  const rawUrl = String(source.url || '').trim()
  if (!rawUrl) return { ok: false, reason: 'no-url' }

  const cacheKey = rawUrl
  const now = Date.now()
  const cached = playabilityCache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.result

  const full = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, origin).toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(full, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: '*/*',
        'User-Agent': DEFAULT_PROBE_UA,
      },
    })

    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    const reader = response.body?.getReader()
    let prefix = Buffer.alloc(0)
    if (reader) {
      const { value } = await reader.read()
      if (value) prefix = Buffer.from(value)
      try {
        await reader.cancel()
      } catch {
        /* ignore */
      }
    }

    const head = prefix.toString('utf8', 0, Math.min(prefix.length, 160))
    const isM3u8 =
      contentType.includes('mpegurl') ||
      contentType.includes('apple') ||
      head.includes('#EXTM3U')
    const isDash = contentType.includes('mpd') || head.includes('<MPD')
    const isVideo =
      contentType.includes('video/') ||
      contentType.includes('octet-stream') ||
      contentType.includes('mp2t')
    const ok =
      response.status >= 200 &&
      response.status < 400 &&
      (isM3u8 || isDash || isVideo || prefix.length > 32)

    const result = {
      ok,
      reason: ok
        ? isM3u8
          ? 'hls'
          : isDash
            ? 'dash'
            : isVideo
              ? 'video'
              : 'bytes'
        : `status=${response.status} ct=${contentType}`,
    }
    playabilityCache.set(cacheKey, { result, expiresAt: now + cacheTtlMs })
    return result
  } catch (error) {
    const result = {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    }
    playabilityCache.set(cacheKey, { result, expiresAt: now + Math.min(cacheTtlMs, 30_000) })
    return result
  } finally {
    clearTimeout(timer)
  }
}
