import { readFileSync, writeFileSync } from 'node:fs'

const js = readFileSync('tmp/bingr-index.js', 'utf8')
console.log('js len', js.length)

const endpoints = new Set()
for (const m of js.matchAll(/["'`](\/api\/[^"'`\s]{1,120})["'`]/g)) endpoints.add(m[1])
for (const m of js.matchAll(/api\.bingr\.one[^"'`\s]{0,80}/g)) endpoints.add(m[0])
for (const m of js.matchAll(/["'`](https?:\/\/[^"'`]{0,120}bingr[^"'`]{0,80})["'`]/g)) endpoints.add(m[1])

console.log('\nendpoints:')
for (const e of [...endpoints].sort()) console.log(' ', e)

const keys = [
  'stream',
  'source',
  'embed',
  'm3u8',
  'vidsrc',
  'tmdb',
  'turnstile',
  'play',
  'watch',
  'subtitle',
  'provider',
  'token',
  'cf-turnstile',
]
const report = { endpoints: [...endpoints], hits: {} }
for (const k of keys) {
  const re = new RegExp(`.{0,60}${k}.{0,100}`, 'gi')
  const samples = [...js.matchAll(re)].slice(0, 8).map((m) => m[0].replace(/\s+/g, ' '))
  if (samples.length) {
    report.hits[k] = samples
    console.log('\nKEY', k)
    for (const s of samples.slice(0, 4)) console.log(' ', s)
  }
}

// Also extract route paths
const routes = [...js.matchAll(/path:\s*["'`]([^"'`]{1,80})["'`]/g)].map((m) => m[1])
const routes2 = [...js.matchAll(/to:\s*["'`]\/([^"'`]{1,60})["'`]/g)].map((m) => '/' + m[1])
console.log('\nroutes', [...new Set([...routes, ...routes2])].slice(0, 60))
report.routes = [...new Set([...routes, ...routes2])].slice(0, 100)

writeFileSync('tmp/bingr-js-report.json', JSON.stringify(report, null, 2))
