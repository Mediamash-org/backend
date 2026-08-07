import type { StreamSubtitle } from '../api/types'
import type { SubtitleTrackInfo } from './tracks'

/** Convert SRT timestamps `00:00:01,000` → WebVTT `00:00:01.000`. */
export function srtToVtt(srt: string): string {
  const normalized = srt.replace(/\r+/g, '').trim()
  const body = normalized
    .replace(/^\uFEFF?WEBVTT\s*/i, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  return `WEBVTT\n\n${body}\n`
}

export function ensureVtt(text: string, formatHint?: string): string {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (/^WEBVTT/i.test(trimmed)) return trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`
  const looksSrt =
    formatHint === 'srt' ||
    /^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/m.test(trimmed) ||
    /\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(trimmed)
  if (looksSrt) return srtToVtt(trimmed)
  if (!/^WEBVTT/i.test(trimmed)) return `WEBVTT\n\n${trimmed}\n`
  return trimmed
}

/**
 * Providers sometimes nest CDN URLs as `https://video?url=<real>` without encoding.
 * URLSearchParams truncates at `&` (breaking CloudFront query strings) — take the raw tail.
 */
export function unwrapVideoUrlWrapper(url: string): string {
  const m = url.match(/^https?:\/\/video\?url=(.+)$/i)
  if (!m) return url
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

function parseProxyPayload(rawUrl: string): { origin: string; url: string; headers: Record<string, string> } | null {
  try {
    const proxy = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : 'http://local')
    if (!proxy.pathname.includes('/v1/proxy')) return null
    const dataRaw = proxy.searchParams.get('data')
    if (!dataRaw) return null
    const payload = JSON.parse(decodeURIComponent(dataRaw)) as {
      url?: string
      headers?: Record<string, string>
    }
    if (!payload.url) return null
    return {
      origin: proxy.origin,
      url: unwrapVideoUrlWrapper(payload.url),
      headers: payload.headers || {},
    }
  } catch {
    return null
  }
}

/** Rebuild a host proxy URL after unwrapping nested `video?url=` payloads. */
export function unwrapEmbeddedSubtitleUrl(rawUrl: string): string {
  try {
    if (/^https?:\/\/video\?url=/i.test(rawUrl)) {
      return unwrapVideoUrlWrapper(rawUrl)
    }
    const parsed = parseProxyPayload(rawUrl)
    if (!parsed) return rawUrl
    const proxy = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : 'http://local')
    const dataRaw = proxy.searchParams.get('data')
    if (!dataRaw) return rawUrl
    const before = (JSON.parse(decodeURIComponent(dataRaw)) as { url?: string }).url || ''
    const after = unwrapVideoUrlWrapper(before)
    if (after === before) return rawUrl
    return `${parsed.origin}/v1/proxy?data=${encodeURIComponent(
      JSON.stringify({ url: after, headers: parsed.headers }),
    )}`
  } catch {
    return rawUrl
  }
}

function subtitleHost(proxyOrDirectUrl: string): string {
  try {
    const parsed = parseProxyPayload(proxyOrDirectUrl)
    const target = parsed?.url || unwrapVideoUrlWrapper(proxyOrDirectUrl)
    return new URL(target).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** Higher is better — prefer reliable subtitle CDNs over broken signed wrappers. */
export function scoreSubtitleCandidate(sub: StreamSubtitle): number {
  const url = sub.url || ''
  const host = subtitleHost(url)
  const format = (sub.format || '').toLowerCase()
  let score = 0

  if (format === 'vtt' || /\.vtt(\?|$)/i.test(url)) score += 40
  else if (format === 'srt' || /\.srt(\?|$)/i.test(url)) score += 10

  if (/net27\.cc$/i.test(host)) score += 80
  else if (/vdrk\.site$/i.test(host)) score += 70
  else if (/1x2\.space$/i.test(host)) score += 65
  else if (/ironwallnet\.net$/i.test(host)) score += 50
  else if (/hakunaymatata\.com$/i.test(host)) score -= 20

  // Nested video?url= wrappers are often broken / ENOTFOUND / MissingKey
  try {
    const parsed = parseProxyPayload(url)
    const inner = parsed?.url || url
    if (/^https?:\/\/video\?url=/i.test(inner) || /video\?url=/i.test(url)) score -= 100
  } catch {
    /* ignore */
  }

  if (/\/api\/captions\//i.test(url)) score += 30

  return score
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function buildSubtitleMenuOptions(
  apiSubtitles: StreamSubtitle[],
  hlsTracks: Array<{ name?: string; lang?: string }> = [],
): SubtitleTrackInfo[] {
  const out: SubtitleTrackInfo[] = [{ id: 'off', label: 'Off' }]

  // Prefer in-stream (HLS) subtitles when the playlist exposes them.
  // Only fall back to API-extracted subs when the stream has none.
  if (hlsTracks.length > 0) {
    const seen = new Set<string>()
    hlsTracks.forEach((t, i) => {
      const label = t.name || t.lang || `Subtitle ${i + 1}`
      const key = `${normalizeLabel(label)}:${t.lang || ''}`
      if (seen.has(key)) return
      seen.add(key)
      out.push({
        id: `hls-s-${i}`,
        label,
        language: t.lang,
        hlsTrackId: i,
      })
    })
    return out
  }

  // Group API-extracted subs by label, keep best URL + alternates for failover
  const groups = new Map<
    string,
    { label: string; items: Array<{ sub: StreamSubtitle; index: number; score: number }> }
  >()

  apiSubtitles.forEach((sub, index) => {
    const label = sub.label || `Subtitle ${index + 1}`
    const key = normalizeLabel(label)
    const score = scoreSubtitleCandidate(sub)
    const bucket = groups.get(key) || { label, items: [] }
    bucket.items.push({ sub, index, score })
    groups.set(key, bucket)
  })

  for (const [, group] of groups) {
    const sorted = [...group.items].sort((a, b) => b.score - a.score)
    const usable = sorted.filter((x) => x.score > -50)
    const picks = (usable.length ? usable : sorted).slice(0, 6)
    if (!picks.length) continue

    const best = picks[0]
    const urls = picks.map((p) => unwrapEmbeddedSubtitleUrl(p.sub.url))
    out.push({
      id: `api-${best.index}`,
      label: group.label,
      url: urls[0],
      alternateUrls: urls.slice(1),
      language: guessLang(group.label),
      format: best.sub.format,
    })
  }

  return out
}

function guessLang(label: string): string {
  const lower = label.toLowerCase()
  if (/\beng(lish)?\b/.test(lower)) return 'en'
  if (/\bspa(nish)?|es\b/.test(lower)) return 'es'
  if (/\bfre(nch)?|fr\b/.test(lower)) return 'fr'
  return label.slice(0, 2).toLowerCase()
}

export async function fetchSubtitleAsVtt(
  url: string,
  formatHint?: string,
  alternateUrls: string[] = [],
): Promise<string> {
  const candidates = [url, ...alternateUrls]
    .map((u) => unwrapEmbeddedSubtitleUrl(u))
    .filter(Boolean)

  const unique = [...new Set(candidates)]
  let lastError: Error | null = null

  for (const candidate of unique) {
    try {
      const res = await fetch(candidate)
      if (!res.ok) {
        lastError = new Error(`Subtitle request failed (${res.status})`)
        continue
      }
      const text = await res.text()
      if (/^\s*<(!DOCTYPE|html|Error)[\s>]|MissingKey|AccessDenied|AccessDenied|ENOTFOUND/i.test(text)) {
        lastError = new Error('Subtitle CDN rejected the request')
        continue
      }
      if (!text.trim()) {
        lastError = new Error('Empty subtitle body')
        continue
      }
      return ensureVtt(text, formatHint)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Subtitle fetch failed')
    }
  }

  throw lastError || new Error('Subtitle request failed')
}

function parseTimestamp(ts: string): number {
  const clean = ts.trim().replace(',', '.')
  const parts = clean.split(':')
  if (parts.length === 3) {
    const [h, m, s] = parts
    return Number(h) * 3600 + Number(m) * 60 + Number(s)
  }
  if (parts.length === 2) {
    const [m, s] = parts
    return Number(m) * 60 + Number(s)
  }
  return Number(clean) || 0
}

/** Clear all cues from a text track. */
export function clearTextTrack(track: TextTrack): void {
  const cues = track.cues
  if (!cues) return
  for (let i = cues.length - 1; i >= 0; i--) {
    const cue = cues[i]
    if (cue) track.removeCue(cue)
  }
}

/** Parse WebVTT into cues on an existing TextTrack. */
export function applyVttToTrack(track: TextTrack, vtt: string): number {
  clearTextTrack(track)
  const lines = vtt.replace(/\r/g, '').split('\n')
  let i = 0
  if (/^WEBVTT/i.test(lines[0] || '')) i = 1
  let added = 0

  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i++
    if (i >= lines.length) break

    if (/^(NOTE|STYLE|REGION)\b/i.test(lines[i])) {
      while (i < lines.length && lines[i].trim()) i++
      continue
    }

    if (!lines[i].includes('-->') && i + 1 < lines.length && lines[i + 1].includes('-->')) {
      i++
    }

    const timing = lines[i]
    if (!timing || !timing.includes('-->')) {
      i++
      continue
    }

    const [startRaw, endPart] = timing.split('-->')
    const endRaw = (endPart || '').trim().split(/\s+/)[0]
    i++
    const textLines: string[] = []
    while (i < lines.length && lines[i].trim()) {
      textLines.push(lines[i])
      i++
    }
    const text = textLines
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (!text) continue

    const start = parseTimestamp(startRaw)
    const end = parseTimestamp(endRaw)
    if (!(end > start)) continue
    try {
      track.addCue(new VTTCue(start, end, text))
      added++
    } catch {
      /* ignore malformed cue */
    }
  }

  return added
}
