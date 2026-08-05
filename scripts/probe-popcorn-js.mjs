import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://web.archive.org/web/20260704233847js_/https://popcornmovies.io'
const chunks = [
  '0_cgkvrskjw5r.js',
  '3h7cb93847ev3.js',
  '2__kiadty_yel.js',
  '1z6i6l_os25s0.js',
  '1mry5dr4bc-ul.js',
  '30j1u0uope-dp.js',
  '0p36ugiw8n98l.js',
  '0vnatod8z8u7g.js',
  '3xi2mauw9-kpe.js',
  '1196c86ltk4v5.js',
  '0sd75lu_e01rc.js',
  '1q8u2pv9pbb2v.js',
]

mkdirSync('tmp/popcorn-js', { recursive: true })

for (const name of chunks) {
  const url = `${BASE}/_next/static/chunks/${name}`
  process.stdout.write(`fetch ${name}... `)
  try {
    const r = await fetch(url, { redirect: 'follow' })
    const text = await r.text()
    writeFileSync(join('tmp/popcorn-js', name), text)
    console.log(r.status, text.length)
  } catch (e) {
    console.log('ERR', e.message)
  }
}

const keys = [
  '/api/',
  'm3u8',
  'vidsrc',
  '2embed',
  'embed',
  'playlist',
  'stream',
  'source',
  'player',
  'tmdb',
  'xpass',
  'videasy',
  'vidlink',
  'autoembed',
  'multiembed',
  'smashy',
  'rabbitstream',
  'fetch(',
  'iframe',
  'watch/movie',
  'watch/tv',
]

const hits = {}
for (const file of readdirSync('tmp/popcorn-js')) {
  const text = readFileSync(join('tmp/popcorn-js', file), 'utf8')
  const fileHits = []
  for (const k of keys) {
    if (!text.toLowerCase().includes(k.toLowerCase())) continue
    const re = new RegExp(`.{0,50}${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.{0,80}`, 'gi')
    const samples = [...text.matchAll(re)].slice(0, 4).map((m) => m[0].replace(/\s+/g, ' '))
    fileHits.push({ k, n: (text.toLowerCase().match(new RegExp(k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, samples })
  }
  if (fileHits.length) hits[file] = fileHits
}

// Extract string literals that look like endpoints
const endpoints = new Set()
for (const file of readdirSync('tmp/popcorn-js')) {
  const text = readFileSync(join('tmp/popcorn-js', file), 'utf8')
  for (const m of text.matchAll(/["'`](\/(?:api|v1|stream|embed|player|watch)[^"'`]{0,100})["'`]/g)) {
    endpoints.add(m[1])
  }
  for (const m of text.matchAll(/["'`](https?:\/\/[^"'`]{0,120})["'`]/g)) {
    const u = m[1]
    if (/embed|vidsrc|stream|m3u8|tmdb|api|player|xpass|videasy/i.test(u)) endpoints.add(u)
  }
}

writeFileSync(
  'tmp/popcorn-js-report.json',
  JSON.stringify({ endpoints: [...endpoints].slice(0, 200), hits }, null, 2),
)
console.log('\nendpoints', [...endpoints].slice(0, 80))
console.log('\nwrote tmp/popcorn-js-report.json')
