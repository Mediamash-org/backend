/**
 * Per-provider smoke test (isolates via admin enable/disable + cache-busting restart expectation).
 * Call providers one-at-a-time so results are not mixed by the shared movie:{id} cache.
 *
 * Usage: node scripts/smoke-providers-isolated.mjs [baseUrl]
 */
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')

const PROVIDERS = [
  'netmirror',
  'peachify',
  'vidsrc',
  'vaultplayer',
  '2embed',
  'bingr',
  'streamingunity',
  'filmo',
  'pikashow',
]

const MOVIES = [
  { id: 27205, title: 'Inception', year: 2010 },
  { id: 603, title: 'The Matrix', year: 1999 },
  { id: 157336, title: 'Interstellar', year: 2014 },
  { id: 438631, title: 'Dune', year: 2021 },
  { id: 872585, title: 'Oppenheimer', year: 2023 },
  { id: 693134, title: 'Dune: Part Two', year: 2024 },
  { id: 533535, title: 'Deadpool & Wolverine', year: 2024 },
]

const SERIES = [
  { id: 1396, s: 1, e: 1, title: 'Breaking Bad' },
  { id: 1399, s: 1, e: 1, title: 'Game of Thrones' },
  { id: 66732, s: 1, e: 1, title: 'Stranger Things' },
  { id: 94997, s: 1, e: 1, title: 'House of the Dragon' },
  { id: 136315, s: 1, e: 1, title: 'The Bear' },
]

const RESOLVE_MS = 120_000
const PLAY_MS = 20_000

async function admin(path, method = 'GET') {
  const res = await fetch(`${BASE}${path}`, { method })
  const text = await res.text()
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text) }
  } catch {
    return { ok: res.ok, status: res.status, text: text.slice(0, 200) }
  }
}

async function setOnly(providerId) {
  const list = await admin('/admin/providers')
  const ids = (list.json?.providers || []).map((p) => p.id)
  for (const id of ids) {
    if (id === providerId) {
      await admin(`/admin/providers/${encodeURIComponent(id)}/enable`, 'POST')
    } else {
      await admin(`/admin/providers/${encodeURIComponent(id)}/disable`, 'POST')
    }
  }
}

async function enableAll() {
  const list = await admin('/admin/providers')
  for (const p of list.json?.providers || []) {
    if (PROVIDERS.includes(p.id) || p.id === 'example') {
      // leave example disabled
      if (p.id === 'example') {
        await admin(`/admin/providers/example/disable`, 'POST')
      } else {
        await admin(`/admin/providers/${encodeURIComponent(p.id)}/enable`, 'POST')
      }
    }
  }
}

function absUrl(url) {
  if (!url) return null
  if (url.startsWith('http')) return url
  if (url.startsWith('/')) return `${BASE}${url}`
  return url
}

async function fetchSources(path) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), RESOLVE_MS)
  const t0 = Date.now()
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    })
    const json = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, json }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    }
  } finally {
    clearTimeout(t)
  }
}

async function probePlay(url) {
  const full = absUrl(url)
  if (!full) return { ok: false, reason: 'no-url' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PLAY_MS)
  try {
    const res = await fetch(full, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        Accept: '*/*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      },
    })
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    const reader = res.body?.getReader()
    let prefix = Buffer.alloc(0)
    if (reader) {
      const { value } = await reader.read()
      if (value) prefix = Buffer.from(value)
      try {
        await reader.cancel()
      } catch {}
    }
    const head = prefix.toString('utf8', 0, Math.min(prefix.length, 160))
    const isM3u8 =
      ct.includes('mpegurl') ||
      ct.includes('apple') ||
      head.includes('#EXTM3U')
    const isDash = ct.includes('mpd') || head.includes('<MPD')
    const isVideo =
      ct.includes('video/') || ct.includes('octet-stream') || ct.includes('mp2t')
    const ok =
      res.status >= 200 &&
      res.status < 400 &&
      (isM3u8 || isDash || isVideo || prefix.length > 32)
    return {
      ok,
      status: res.status,
      reason: ok
        ? isM3u8
          ? 'hls'
          : isDash
            ? 'dash'
            : isVideo
              ? 'video'
              : 'bytes'
        : `status=${res.status} ct=${ct} head=${JSON.stringify(head.slice(0, 48))}`,
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

async function testMedia(providerId, kind, media) {
  // Unique-ish cache key: framework caches movie:{id} — we isolate by having only one provider enabled.
  // Also append a cache-buster query the framework ignores for keying but... actually cache ignores query.
  // Isolation is the real bust: after switching providers, OLD cache still returns previous provider's
  // sources under movie:{id}. So we must use titles that weren't cached for this process run,
  // OR restart server between providers, OR delete cache.
  // Workaround: use refresh endpoint if we have responseId from a prior miss... still returns cached body shape.
  // Best bust: request with a never-before-seen id only once per provider — so restart server with TTL=0 first.
  // Here we rely on caller restarting with CACHE_SOURCES_TTL=0 and sequential unique first-touch per provider.

  const path =
    kind === 'movie'
      ? `/v1/movies/${media.id}`
      : `/v1/tv/${media.id}/seasons/${media.s}/episodes/${media.e}`

  const label =
    kind === 'movie'
      ? `${media.title} (${media.year})`
      : `${media.title} S${media.s}E${media.e}`

  const resolved = await fetchSources(path)
  if (!resolved.ok || !resolved.json) {
    const err =
      resolved.error ||
      resolved.json?.error?.message ||
      `http ${resolved.status}`
    console.log(`  [${providerId}] ${kind} ${label}: FAIL ${err} ${resolved.ms}ms`)
    return { ok: false, sources: 0, playOk: 0, playFail: 0, error: err, ms: resolved.ms }
  }

  const sources = (resolved.json.sources || []).filter(
    (s) => !s.provider?.id || s.provider.id === providerId,
  )
  const foreign = (resolved.json.sources || []).filter(
    (s) => s.provider?.id && s.provider.id !== providerId,
  )
  const diags = (resolved.json.diagnostics || [])
    .map((d) => d.message || d.code)
    .filter(Boolean)

  if (foreign.length) {
    console.log(
      `  [${providerId}] ${kind} ${label}: CACHE POLLUTED with ${[...new Set(foreign.map((s) => s.provider.id))].join(',')}`,
    )
  }

  if (!sources.length) {
    const err = diags.find((d) => String(d).toLowerCase().includes(providerId)) || diags[0] || 'no sources'
    console.log(`  [${providerId}] ${kind} ${label}: 0 sources (${err}) ${resolved.ms}ms`)
    return {
      ok: false,
      sources: 0,
      playOk: 0,
      playFail: 0,
      error: String(err),
      ms: resolved.ms,
      polluted: foreign.length > 0,
    }
  }

  const seen = new Set()
  const toProbe = []
  for (const s of sources) {
    if (!s.url || seen.has(s.url)) continue
    seen.add(s.url)
    toProbe.push(s)
    if (toProbe.length >= 2) break
  }

  let playOk = 0
  let playFail = 0
  const reasons = []
  for (const s of toProbe) {
    const play = await probePlay(s.url)
    if (play.ok) playOk++
    else {
      playFail++
      reasons.push(play.reason)
    }
  }

  const ok = playOk > 0
  console.log(
    `  [${providerId}] ${kind} ${label}: ${sources.length} src, play ${playOk}/${toProbe.length} ${resolved.ms}ms` +
      (ok ? '' : ` dead:${reasons[0] || '?'}`),
  )
  return {
    ok,
    sources: sources.length,
    playOk,
    playFail,
    ms: resolved.ms,
    polluted: foreign.length > 0,
  }
}

async function main() {
  console.log(`Base: ${BASE}`)
  const health = await fetch(`${BASE}/v1`).then((r) => r.json())
  console.log(
    'Loaded:',
    (health.providers || []).map((p) => p.id).join(', '),
  )

  // Disable example always
  await admin('/admin/providers/example/disable', 'POST')

  /** @type {Record<string, any>} */
  const report = {}

  try {
    for (const id of PROVIDERS) {
      console.log(`\n==== Isolating ${id} ====`)
      await setOnly(id)
      // small pause so registry settles
      await new Promise((r) => setTimeout(r, 200))

      const movie = []
      const tv = []
      for (const m of MOVIES) movie.push(await testMedia(id, 'movie', m))
      for (const s of SERIES) tv.push(await testMedia(id, 'tv', s))
      report[id] = { movie, tv }
    }
  } finally {
    console.log('\n==== Restoring providers ====')
    await enableAll()
  }

  console.log('\n======== SUMMARY ========')
  console.log(
    'provider'.padEnd(16),
    'm_src',
    'm_play',
    't_src',
    't_play',
    'verdict',
  )

  const remove = []
  const keep = []
  const weak = []

  for (const id of PROVIDERS) {
    const m = report[id].movie
    const t = report[id].tv
    const mSrc = m.filter((c) => c.sources > 0).length
    const mPlay = m.filter((c) => c.ok).length
    const tSrc = t.filter((c) => c.sources > 0).length
    const tPlay = t.filter((c) => c.ok).length
    const polluted = [...m, ...t].some((c) => c.polluted)
    const anyPlay = mPlay + tPlay
    const anySrc = mSrc + tSrc

    let verdict
    if (polluted) {
      verdict = 'INVALID (cache pollution — retest)'
      weak.push(id)
    } else if (anyPlay === 0 && anySrc === 0) {
      verdict = 'REMOVE (unreachable)'
      remove.push(id)
    } else if (anyPlay === 0 && anySrc > 0) {
      verdict = 'REMOVE (dead streams)'
      remove.push(id)
    } else if (anyPlay < 2 && (mPlay + tPlay) / (m.length + t.length) < 0.25) {
      verdict = 'WEAK'
      weak.push(id)
    } else {
      verdict = 'KEEP'
      keep.push(id)
    }

    console.log(
      id.padEnd(16),
      `${mSrc}/${m.length}`.padStart(5),
      `${mPlay}/${m.length}`.padStart(6),
      `${tSrc}/${t.length}`.padStart(5),
      `${tPlay}/${t.length}`.padStart(6),
      verdict,
    )
  }

  const fs = await import('fs/promises')
  await fs.writeFile(
    new URL('../tmp/provider-smoke-isolated.json', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), keep, weak, remove, report }, null, 2),
  )
  console.log('\nKEEP:', keep.join(', ') || '(none)')
  console.log('WEAK:', weak.join(', ') || '(none)')
  console.log('REMOVE:', remove.join(', ') || '(none)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
