import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'tmp/popcorn-js'
const out = []

for (const f of readdirSync(dir)) {
  const t = readFileSync(join(dir, f), 'utf8')
  if (!t.includes('playToken') && !t.includes('/api/sources') && !t.includes('sources.length')) {
    continue
  }
  out.push(`\n##### ${f} #####`)
  const markers = ['playToken', '/api/sources', 'e.sources', 'kind:"hls"', 'kind:"mp4"', '.kind', 'provider']
  for (const m of markers) {
    let from = 0
    let n = 0
    while (n < 3) {
      const i = t.indexOf(m, from)
      if (i < 0) break
      out.push(`\n-- ${m} @${i} --\n${t.slice(Math.max(0, i - 250), i + 450)}`)
      from = i + m.length
      n++
    }
  }
}

// Watch HTML token hunt
const html = readFileSync('tmp/popcorn-watch-1339713.html', 'utf8')
out.push('\n##### watch html snippets #####')
for (const m of html.matchAll(/.{0,30}playToken.{0,80}/gi)) out.push(m[0])
for (const m of html.matchAll(/"token":"[^"]{8,120}"/g)) out.push(m[0])
for (const m of html.matchAll(/x-play-token[^"]{0,40}/g)) out.push(m[0])

writeFileSync('tmp/popcorn-token-hunt.txt', out.join('\n'))
console.log('wrote tmp/popcorn-token-hunt.txt chars', out.join('\n').length)

// Summarize source object usage near Player selection
const player = readFileSync('tmp/popcorn-js/2__kiadty_yel.js', 'utf8')
const pick = player.indexOf('eo.current=e.sources')
console.log('\nAFTER SOURCES JSON:')
console.log(player.slice(pick, pick + 1800))
