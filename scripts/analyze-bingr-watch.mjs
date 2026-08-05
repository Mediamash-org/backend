import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const files = readdirSync('tmp').filter((f) => f.startsWith('bingr-') && f.endsWith('.js'))
const endpoints = new Set()
const samples = []

for (const file of files) {
  const text = readFileSync(join('tmp', file), 'utf8')
  for (const m of text.matchAll(/["'`](\/?(?:api\/)?[a-zA-Z0-9_./${}-]*?(?:stream|source|play|embed|watch|subtitle|media|episode|movie|tv|anime|proxy|m3u8)[a-zA-Z0-9_./${}-]*)["'`]/g)) {
    endpoints.add(`${file}: ${m[1]}`)
  }
  for (const m of text.matchAll(/["'`](\/[a-zA-Z0-9_./${}-]{2,100})["'`]/g)) {
    const p = m[1]
    if (/stream|source|play|embed|subtitle|vdrk|proxy|trailer|tmdb|season/i.test(p)) {
      endpoints.add(`${file}: ${p}`)
    }
  }
  for (const k of ['/stream', '/source', 'vdrk', 'm3u8', 'turnstile', 'play_token', 'x-play', 'provider', 'getSources', 'fetchStream']) {
    if (!text.includes(k)) continue
    const re = new RegExp(`.{0,80}${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.{0,120}`, 'gi')
    for (const m of [...text.matchAll(re)].slice(0, 5)) {
      samples.push({ file, k, s: m[0].replace(/\s+/g, ' ') })
    }
  }
}

console.log('ENDPOINTS')
for (const e of [...endpoints].sort()) console.log(e)
console.log('\nSAMPLES')
for (const s of samples) console.log(`\n[${s.file}] ${s.k}\n ${s.s}`)

writeFileSync(
  'tmp/bingr-watch-report.json',
  JSON.stringify({ endpoints: [...endpoints], samples }, null, 2),
)
