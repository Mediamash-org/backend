/**
 * Smoke-test all OMSS providers: resolve sources for several movies/series,
 * then probe each returned URL for a playable response.
 *
 * Usage: node scripts/smoke-all-providers.mjs [baseUrl]
 */
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')

const PROVIDERS = [
  'netmirror',
  'peachify',
  'vidsrc',
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

const RESOLVE_TIMEOUT_MS = 90_000
const PLAY_TIMEOUT_MS = 25_000

/** @typedef {{ ok: boolean, sources: number, playOk: number, playFail: number, error?: string, ms: number, diagnostics?: string[] }} Cell */

/** @type {Record<string, { movie: Cell[], tv: Cell[], notes: string[] }>} */
const report = Object.fromEntries(
  PROVIDERS.map((id) => [id, { movie: [], tv: [], notes: [] }]),
)

function absUrl(url) {
  if (!url) return null
  if (url.startsWith('http')) return url
  if (url.startsWith('/')) return `${BASE}${url}`
  return url
}

async function fetchJson(path) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), RESOLVE_TIMEOUT_MS)
  const t0 = Date.now()
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      return {
        ok: false,
        status: res.status,
        ms: Date.now() - t0,
        error: `non-json ${res.status}: ${text.slice(0, 120)}`,
      }
    }
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, json }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function probePlay(url) {
  const full = absUrl(url)
  if (!full) return { ok: false, reason: 'no-url' }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PLAY_TIMEOUT_MS)
  try {
    const res = await fetch(full, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        Accept: '*/*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    })
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    // Read a small prefix only
    const reader = res.body?.getReader()
    let prefix = Buffer.alloc(0)
    if (reader) {
      const { value } = await reader.read()
      if (value) prefix = Buffer.from(value)
      try {
        await reader.cancel()
      } catch {}
    }
    const head = prefix.toString('utf8', 0, Math.min(prefix.length, 200))
    const isM3u8 =
      ct.includes('mpegurl') ||
      ct.includes('application/vnd.apple') ||
      head.includes('#EXTM3U')
    const isDash =
      ct.includes('mpd') || head.includes('<MPD') || head.includes('<?xml')
    const isVideo =
      ct.includes('video/') ||
      ct.includes('octet-stream') ||
      ct.includes('mp2t')
    const ok =
      res.status >= 200 &&
      res.status < 400 &&
      (isM3u8 || isDash || isVideo || prefix.length > 32)
    return {
      ok,
      status: res.status,
      ct,
      reason: ok
        ? isM3u8
          ? 'hls'
          : isDash
            ? 'dash'
            : isVideo
              ? 'video'
              : 'bytes'
        : `status=${res.status} ct=${ct} head=${head.slice(0, 40)}`,
    }
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {string} providerId
 * @param {'movie'|'tv'} kind
 * @param {object} media
 */
async function testOne(providerId, kind, media) {
  const path =
    kind === 'movie'
      ? `/v1/movies/${media.id}?provider=${encodeURIComponent(providerId)}`
      : `/v1/tv/${media.id}/seasons/${media.s}/episodes/${media.e}?provider=${encodeURIComponent(providerId)}`

  const label =
    kind === 'movie'
      ? `${media.title} (${media.year})`
      : `${media.title} S${media.s}E${media.e}`

  const resolved = await fetchJson(path)
  /** @type {Cell} */
  const cell = {
    ok: false,
    sources: 0,
    playOk: 0,
    playFail: 0,
    ms: resolved.ms,
  }

  if (!resolved.ok || !resolved.json) {
    cell.error = resolved.error || `http ${resolved.status}`
    console.log(
      `  [${providerId}] ${kind} ${label}: FAIL resolve (${cell.error}) ${cell.ms}ms`,
    )
    return cell
  }

  const sources = Array.isArray(resolved.json.sources)
    ? resolved.json.sources
    : []
  const diags = Array.isArray(resolved.json.diagnostics)
    ? resolved.json.diagnostics
        .map((d) => d?.message || d?.code || JSON.stringify(d))
        .filter(Boolean)
    : []
  cell.sources = sources.length
  cell.diagnostics = diags.slice(0, 3)

  if (!sources.length) {
    cell.error = diags[0] || 'no sources'
    console.log(
      `  [${providerId}] ${kind} ${label}: 0 sources (${cell.error}) ${cell.ms}ms`,
    )
    return cell
  }

  // Probe up to 2 distinct source URLs
  const seen = new Set()
  const toProbe = []
  for (const s of sources) {
    const u = s?.url
    if (!u || seen.has(u)) continue
    seen.add(u)
    toProbe.push(s)
    if (toProbe.length >= 2) break
  }

  for (const s of toProbe) {
    const play = await probePlay(s.url)
    if (play.ok) cell.playOk++
    else cell.playFail++
  }

  cell.ok = cell.playOk > 0
  console.log(
    `  [${providerId}] ${kind} ${label}: ${cell.sources} src, play ${cell.playOk}/${toProbe.length} ${cell.ms}ms` +
      (cell.ok ? '' : ` (${toProbe.map(() => 'dead').join(',')})`),
  )
  return cell
}

function summarize(cells) {
  const n = cells.length
  const withSources = cells.filter((c) => c.sources > 0).length
  const playable = cells.filter((c) => c.ok).length
  const resolveFail = cells.filter((c) => c.error && c.sources === 0).length
  return { n, withSources, playable, resolveFail }
}

async function main() {
  console.log(`Base: ${BASE}`)
  const info = await fetchJson('/v1')
  if (!info.ok) {
    console.error('Server not reachable:', info.error)
    process.exit(1)
  }
  const listed = (info.json?.providers || []).map((p) => p.id)
  console.log('Providers on /v1:', listed.join(', ') || '(none)')
  console.log('')

  for (const id of PROVIDERS) {
    if (!listed.includes(id)) {
      report[id].notes.push('not listed on /v1')
      console.log(`== ${id} (NOT LOADED) ==`)
      continue
    }
    console.log(`== ${id} movies ==`)
    for (const m of MOVIES) {
      report[id].movie.push(await testOne(id, 'movie', m))
    }
    console.log(`== ${id} tv ==`)
    for (const s of SERIES) {
      report[id].tv.push(await testOne(id, 'tv', s))
    }
    console.log('')
  }

  console.log('\n======== SUMMARY ========')
  console.log(
    'provider'.padEnd(16),
    'movie_src',
    'movie_play',
    'tv_src',
    'tv_play',
    'verdict',
  )

  /** @type {string[]} */
  const remove = []
  /** @type {string[]} */
  const keep = []
  /** @type {string[]} */
  const weak = []

  for (const id of PROVIDERS) {
    const m = summarize(report[id].movie)
    const t = summarize(report[id].tv)
    const movieRate = m.n ? m.playable / m.n : 0
    const tvRate = t.n ? t.playable / t.n : 0
    const anyPlay = m.playable + t.playable
    const anySrc = m.withSources + t.withSources

    let verdict
    if (report[id].notes.includes('not listed on /v1')) {
      verdict = 'REMOVE (not loaded)'
      remove.push(id)
    } else if (anyPlay === 0 && anySrc === 0) {
      verdict = 'REMOVE (unreachable)'
      remove.push(id)
    } else if (anyPlay === 0 && anySrc > 0) {
      verdict = 'REMOVE (sources dead)'
      remove.push(id)
    } else if (movieRate < 0.3 && tvRate < 0.3 && anyPlay < 2) {
      verdict = 'WEAK / consider remove'
      weak.push(id)
    } else {
      verdict = 'KEEP'
      keep.push(id)
    }

    console.log(
      id.padEnd(16),
      `${m.withSources}/${m.n}`.padStart(9),
      `${m.playable}/${m.n}`.padStart(10),
      `${t.withSources}/${t.n}`.padStart(6),
      `${t.playable}/${t.n}`.padStart(7),
      verdict,
    )
  }

  const out = {
    base: BASE,
    at: new Date().toISOString(),
    keep,
    weak,
    remove,
    report,
  }
  const outPath = new URL('../tmp/provider-smoke-report.json', import.meta.url)
  await import('fs/promises').then((fs) =>
    fs.writeFile(outPath, JSON.stringify(out, null, 2)),
  )
  console.log(`\nWrote ${outPath.pathname}`)
  console.log('\nKEEP:', keep.join(', ') || '(none)')
  console.log('WEAK:', weak.join(', ') || '(none)')
  console.log('REMOVE:', remove.join(', ') || '(none)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
