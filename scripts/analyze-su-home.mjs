import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync('tmp/su-home.html', 'utf8')
console.log('len', html.length)
console.log('title', (html.match(/<title[^>]*>([^<]+)/i) || [])[1])

const scripts = [...html.matchAll(/src=["']([^"']+)["']/gi)].map((m) => m[1])
console.log('scripts', [...new Set(scripts)].slice(0, 50))

const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1])
const interesting = [...new Set(hrefs)].filter(
  (h) =>
    h.startsWith('/') ||
    /watch|title|film|movie|tv|vix|stream|play|api/i.test(h),
)
console.log('hrefs', interesting.slice(0, 60))

const hosts = {}
for (const m of html.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
  try {
    const h = new URL(m[0].replaceAll('&amp;', '&')).host
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
  'vixsrc',
  'vixcloud',
  'inertia',
  'data-page',
  'watch',
  'titles',
  'iframe',
  'm3u8',
  'embed',
  'streamingcommunity',
  'playlist',
  'api/',
  'slug',
]) {
  const re = new RegExp(`.{0,60}${k}.{0,100}`, 'gi')
  const hits = [...html.matchAll(re)].slice(0, 5).map((m) => m[0].replace(/\s+/g, ' '))
  if (hits.length) {
    console.log('\nKEY', k)
    for (const h of hits) console.log(' ', h)
  }
}

writeFileSync(
  'tmp/su-home-meta.json',
  JSON.stringify(
    {
      scripts: [...new Set(scripts)].slice(0, 100),
      hrefs: interesting.slice(0, 150),
      hosts,
    },
    null,
    2,
  ),
)
