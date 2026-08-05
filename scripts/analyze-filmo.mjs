import fs from 'fs'

const html = fs.readFileSync('tmp/filmo-home.html', 'utf8')
console.log('len', html.length)

const assets = [
  ...new Set(
    [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["']([^"']+)["'][^>]*>/gi)].map(
      (m) => m[1],
    ),
  ),
]
console.log('assets', assets.slice(0, 80))

const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1])
const interesting = [...new Set(hrefs)]
  .filter((h) =>
    /film|movie|watch|stream|play|suche|search|genre|title|\/f\/|\/m\/|inception|interstellar/i.test(
      h,
    ),
  )
  .slice(0, 80)
console.log('interesting hrefs', interesting)
console.log(
  'abs',
  [...new Set(hrefs)].filter((h) => h.startsWith('http')).slice(0, 40),
)

for (const pat of [
  'vite',
  'livewire',
  'alpine',
  'inertia',
  'laravel',
  'hls',
  'plyr',
  'jwplayer',
  'videojs',
  'm3u8',
  'turnstile',
  'recaptcha',
  'cloudflare',
  '/api/',
  'tmdb',
  'imdb',
  'csrf',
  'build/assets',
]) {
  const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  console.log(pat, (html.match(re) || []).length)
}

const jsonBlocks = [
  ...html.matchAll(
    /<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ),
]
console.log('json-ld count', jsonBlocks.length)
if (jsonBlocks[0]) console.log(jsonBlocks[0][1].slice(0, 600))

const inline = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1])
  .filter((s) => s && s.trim())
console.log(
  'inline scripts',
  inline.length,
  'sizes',
  inline.map((s) => s.length).slice(0, 15),
)
inline.slice(0, 5).forEach((s, i) => console.log(`inline${i}`, s.slice(0, 500)))

// title path samples from cards
const paths = [...html.matchAll(/href="(\/[a-z]{2}\/[^"]+)"/gi)].map((m) => m[1])
console.log('locale paths sample', [...new Set(paths)].slice(0, 40))
