import { readFileSync } from 'node:fs'

const t = readFileSync('tmp/popcorn-js/2__kiadty_yel.js', 'utf8')
const needles = [
  'src:e.url',
  'e.url',
  'e.kind',
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'status:"ready"',
  'subtitles:e.subtitles',
  'provider',
  'quality',
]

for (const n of needles) {
  let from = 0
  let count = 0
  while (count < 2) {
    const i = t.indexOf(n, from)
    if (i < 0) break
    console.log(`\n=== ${n} @${i} ===`)
    console.log(t.slice(Math.max(0, i - 160), i + 320))
    from = i + n.length
    count++
  }
}
