import fs from 'fs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } })
  const text = await r.text()
  return { status: r.status, url: r.url, text, ct: r.headers.get('content-type') }
}

const config = await get('https://aether.bar/config.js')
fs.writeFileSync('tmp/aether-config.js', config.text)
console.log('config', config.status, config.text)

const jsFiles = [
  'https://aether.bar/assets/index-GP4wrADd.js',
  'https://aether.bar/assets/auth-BXStSppl.js',
  'https://aether.bar/assets/hls-xeo-W7rp.js',
]

for (const u of jsFiles) {
  const r = await get(u)
  const name = u.split('/').pop()
  fs.writeFileSync(`tmp/aether-${name}`, r.text)
  console.log('\nsaved', name, r.text.length)

  const urls = [
    ...new Set(
      [...r.text.matchAll(/["'`]((?:https?:)?\/\/[^"'`\s]{5,}|\/[a-zA-Z0-9_./?&=%-]{4,})["'`]/g)].map(
        (m) => m[1],
      ),
    ),
  ].filter((x) =>
    /api|stream|play|watch|movie|tv|tmdb|source|proxy|embed|search|media|hls|m3u8/i.test(x),
  )
  console.log('urls', urls.slice(0, 80))

  for (const pat of [
    'tmdb',
    'stream',
    'source',
    'm3u8',
    '/api',
    'baseUrl',
    'BASE_URL',
    'VITE_',
    'fetch(',
    'axios',
    'provider',
  ]) {
    const re = new RegExp(`.{0,50}${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.{0,80}`, 'gi')
    const hits = [...r.text.matchAll(re)].slice(0, 6).map((m) => m[0].replace(/\s+/g, ' '))
    if (hits.length) {
      console.log(`-- ${pat}`)
      hits.forEach((h) => console.log(h))
    }
  }
}
