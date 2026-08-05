import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync('tmp/popcorn-archive.html', 'utf8')
console.log('len', html.length)
console.log('title', (html.match(/<title[^>]*>([^<]+)/i) || [])[1])

const scripts = [...html.matchAll(/src="([^"]+_next[^"]+)"/gi)].map((m) => m[1])
console.log('next scripts', [...new Set(scripts)].slice(0, 30))

const urlRe = /https?:\/\/[^\s"'<>\\]+/g
const urls = html.match(urlRe) || []
const hosts = {}
for (const u of urls) {
  try {
    const h = new URL(u.replace(/&amp;/g, '&')).host
    hosts[h] = (hosts[h] || 0) + 1
  } catch {
    /* ignore */
  }
}
console.log(
  'hosts',
  Object.entries(hosts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40),
)

for (const k of [
  'vidsrc',
  '2embed',
  'embed',
  'm3u8',
  'tmdb',
  '/api/',
  'stream',
  'playlist',
  'xpass',
  'watch',
  'movie/',
  'image.tmdb',
]) {
  const re = new RegExp(`.{0,40}${k}.{0,60}`, 'gi')
  const hits = [...html.matchAll(re)].slice(0, 6).map((m) => m[0].replace(/\s+/g, ' '))
  if (hits.length) {
    console.log('\nKEY', k)
    for (const h of hits) console.log(' ', h)
  }
}

const paths = [
  ...html.matchAll(/"(\/(?:api|watch|movie|movies|tv|title|embed|player|media)\/[^"]{1,100})"/g),
].map((m) => m[1])
console.log('\npaths', [...new Set(paths)].slice(0, 80))

// RSC / flight payload fragments mentioning providers
const providerish = [
  ...html.matchAll(/"(?:provider|source|server|embed)[^"]{0,40}"\s*:\s*"[^"]{1,80}"/gi),
].slice(0, 40)
console.log('\nproviderish', providerish.map((m) => m[0]))

writeFileSync(
  'tmp/popcorn-analysis.json',
  JSON.stringify(
    {
      title: (html.match(/<title[^>]*>([^<]+)/i) || [])[1],
      hosts,
      paths: [...new Set(paths)].slice(0, 150),
      scripts: [...new Set(scripts)].slice(0, 50),
      providerish: providerish.map((m) => m[0]),
    },
    null,
    2,
  ),
)
