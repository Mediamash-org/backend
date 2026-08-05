import fs from 'fs'

const r = await fetch('https://fembox.aether.bar/info/movie/27205', {
  headers: { Accept: 'application/json' },
})
const j = await r.json()
fs.writeFileSync('tmp/aether-fembox-info-27205.json', JSON.stringify(j, null, 2))
console.log('keys', Object.keys(j))
for (const k of Object.keys(j)) {
  const v = j[k]
  console.log(
    '---',
    k,
    typeof v,
    v && typeof v === 'object' ? Object.keys(v).slice(0, 25) : '',
  )
}
const s = JSON.stringify(j)
console.log('len', s.length)
console.log('m3u8', /m3u8/i.test(s), 'mp4', /\.mp4/i.test(s))
const urls = [...s.matchAll(/https?:\\\/\\\/[^"\\]+|https?:\/\/[^"\\s]+/g)].map((m) =>
  m[0].replace(/\\\//g, '/'),
)
console.log('urls', [...new Set(urls)].slice(0, 50))
