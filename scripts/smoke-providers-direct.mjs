/**
 * Direct in-process provider smoke (bypasses OMSS response cache).
 * Probes returned stream/proxy URLs against a running host for playback.
 *
 * Usage: node scripts/smoke-providers-direct.mjs [proxyBaseUrl]
 */
import { createOmssProviders as createNetmirror } from '../plugins/netmirror-provider/dist/index.js'
import { createOmssProviders as createPeachify } from '../plugins/peachify-provider/dist/index.js'
import { createOmssProviders as createVidsrc } from '../plugins/vidsrc-provider/dist/index.js'
import { createOmssProviders as createTwoEmbed } from '../plugins/twoembed-provider/dist/index.js'
import { createOmssProviders as createBingr } from '../plugins/bingr-provider/dist/index.js'
import { createOmssProviders as createStreamingUnity } from '../plugins/streamingunity-provider/dist/index.js'
import { createOmssProviders as createFilmo } from '../plugins/filmo-provider/dist/index.js'
import { createOmssProviders as createPikashow } from '../plugins/pikashow-provider/dist/index.js'
import fs from 'fs/promises'

const PROXY_BASE = (process.argv[2] || process.env.PUBLIC_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
)
process.env.PUBLIC_URL = PROXY_BASE

const FACTORIES = [
  ['netmirror', createNetmirror],
  ['peachify', createPeachify],
  ['vidsrc', createVidsrc],
  ['2embed', createTwoEmbed],
  ['bingr', createBingr],
  ['streamingunity', createStreamingUnity],
  ['filmo', createFilmo],
  ['pikashow', createPikashow],
]

const MOVIES = [
  { tmdbId: 27205, title: 'Inception', year: 2010, imdbId: 'tt1375666' },
  { tmdbId: 603, title: 'The Matrix', year: 1999, imdbId: 'tt0133093' },
  { tmdbId: 157336, title: 'Interstellar', year: 2014, imdbId: 'tt0816692' },
  { tmdbId: 438631, title: 'Dune', year: 2021, imdbId: 'tt1160419' },
  { tmdbId: 872585, title: 'Oppenheimer', year: 2023, imdbId: 'tt15398776' },
  { tmdbId: 693134, title: 'Dune: Part Two', year: 2024, imdbId: 'tt15239678' },
  { tmdbId: 533535, title: 'Deadpool & Wolverine', year: 2024, imdbId: 'tt6263850' },
]

const SERIES = [
  { tmdbId: 1396, title: 'Breaking Bad', year: 2008, s: 1, e: 1, imdbId: 'tt0903747' },
  { tmdbId: 1399, title: 'Game of Thrones', year: 2011, s: 1, e: 1, imdbId: 'tt0944947' },
  { tmdbId: 66732, title: 'Stranger Things', year: 2016, s: 1, e: 1, imdbId: 'tt4574334' },
  { tmdbId: 94997, title: 'House of the Dragon', year: 2022, s: 1, e: 1, imdbId: 'tt11198330' },
  { tmdbId: 136315, title: 'The Bear', year: 2022, s: 1, e: 1, imdbId: 'tt14411728' },
]

const PLAY_MS = 20_000
const RESOLVE_MS = 90_000

function movieMedia(m) {
  return {
    type: 'movie',
    title: m.title,
    year: m.year,
    tmdbId: m.tmdbId,
    imdbId: m.imdbId,
  }
}

function tvMedia(s) {
  return {
    type: 'tv',
    title: s.title,
    year: s.year,
    tmdbId: s.tmdbId,
    imdbId: s.imdbId,
    s: s.s,
    e: s.e,
  }
}

function absUrl(url) {
  if (!url) return null
  if (url.startsWith('http')) return url
  if (url.startsWith('/')) return `${PROXY_BASE}${url}`
  return url
}

async function withTimeout(promise, ms, label) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout ${ms}ms (${label})`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
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
      ct.includes('mpegurl') || ct.includes('apple') || head.includes('#EXTM3U')
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
        : `status=${res.status} ct=${ct} head=${JSON.stringify(head.slice(0, 40))}`,
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

async function testOne(provider, kind, media, label) {
  const t0 = Date.now()
  try {
    const result = await withTimeout(
      kind === 'movie'
        ? provider.getMovieSources(media)
        : provider.getTVSources(media),
      RESOLVE_MS,
      label,
    )
    const sources = result?.sources || []
    const diags = (result?.diagnostics || [])
      .map((d) => d.message || d.code)
      .filter(Boolean)

    if (!sources.length) {
      console.log(
        `  [${provider.id}] ${kind} ${label}: 0 sources (${diags[0] || 'empty'}) ${Date.now() - t0}ms`,
      )
      return { ok: false, sources: 0, playOk: 0, error: diags[0] || 'empty', ms: Date.now() - t0 }
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
    const reasons = []
    for (const s of toProbe) {
      const play = await probePlay(s.url)
      if (play.ok) playOk++
      else reasons.push(play.reason)
    }

    const ok = playOk > 0
    console.log(
      `  [${provider.id}] ${kind} ${label}: ${sources.length} src, play ${playOk}/${toProbe.length} ${Date.now() - t0}ms` +
        (ok ? '' : ` dead:${reasons[0] || '?'}`),
    )
    return {
      ok,
      sources: sources.length,
      playOk,
      playFail: toProbe.length - playOk,
      ms: Date.now() - t0,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  [${provider.id}] ${kind} ${label}: ERROR ${msg} ${Date.now() - t0}ms`)
    return { ok: false, sources: 0, playOk: 0, error: msg, ms: Date.now() - t0 }
  }
}

async function main() {
  // Ensure proxy base is set before providers encode URLs
  const { BaseProvider } = await import('@omss/framework')
  BaseProvider.setProxyConfig({
    baseUrl: PROXY_BASE,
    host: 'localhost',
    port: 3000,
    protocol: 'http',
  })

  console.log(`Proxy base: ${PROXY_BASE}`)
  try {
    const ping = await fetch(`${PROXY_BASE}/v1`)
    console.log(`Host /v1: ${ping.status}`)
  } catch (e) {
    console.warn('Host not reachable — will still resolve sources, playback probes may fail')
  }

  const report = {}

  for (const [id, factory] of FACTORIES) {
    console.log(`\n==== ${id} ====`)
    const [provider] = factory({ id })
    const movie = []
    const tv = []

    for (const m of MOVIES) {
      movie.push(
        await testOne(provider, 'movie', movieMedia(m), `${m.title} (${m.year})`),
      )
    }

    const supportsTv = provider.capabilities?.supportedContentTypes?.includes('tv')
    if (supportsTv) {
      for (const s of SERIES) {
        tv.push(
          await testOne(
            provider,
            'tv',
            tvMedia(s),
            `${s.title} S${s.s}E${s.e}`,
          ),
        )
      }
    } else {
      console.log(`  [${id}] tv: skipped (movies-only)`)
    }

    report[id] = { movie, tv, supportsTv: !!supportsTv }
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

  for (const [id] of FACTORIES) {
    const m = report[id].movie
    const t = report[id].tv
    const mSrc = m.filter((c) => c.sources > 0).length
    const mPlay = m.filter((c) => c.ok).length
    const tSrc = t.filter((c) => c.sources > 0).length
    const tPlay = t.filter((c) => c.ok).length
    const tvExpected = report[id].supportsTv
    const anyPlay = mPlay + tPlay
    const anySrc = mSrc + tSrc
    const movieRate = m.length ? mPlay / m.length : 0
    const tvRate = tvExpected && t.length ? tPlay / t.length : 1

    let verdict
    if (anyPlay === 0 && anySrc === 0) {
      verdict = 'REMOVE (unreachable)'
      remove.push(id)
    } else if (anyPlay === 0 && anySrc > 0) {
      verdict = 'REMOVE (dead streams)'
      remove.push(id)
    } else if (movieRate < 0.3 && (!tvExpected || tvRate < 0.3)) {
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
      tvExpected ? `${tSrc}/${t.length}`.padStart(5) : '  n/a',
      tvExpected ? `${tPlay}/${t.length}`.padStart(6) : '   n/a',
      verdict,
    )
  }

  await fs.writeFile(
    new URL('../tmp/provider-smoke-direct.json', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), proxyBase: PROXY_BASE, keep, weak, remove, report }, null, 2),
  )

  console.log('\nKEEP:', keep.join(', ') || '(none)')
  console.log('WEAK:', weak.join(', ') || '(none)')
  console.log('REMOVE:', remove.join(', ') || '(none)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
