import fs from 'fs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

fs.mkdirSync('tmp', { recursive: true })

async function get(url, headers = {}) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/json,*/*',
      ...headers,
    },
    redirect: 'follow',
  })
  const text = await r.text()
  return {
    status: r.status,
    url: r.url,
    ct: r.headers.get('content-type'),
    text,
    headers: Object.fromEntries(r.headers),
  }
}

const home = await get('https://aether.bar/')
fs.writeFileSync('tmp/aether-home.html', home.text)
console.log('home', home.status, home.url, home.ct, home.text.length)
console.log(home.text.slice(0, 800).replace(/\s+/g, ' '))

for (const pat of [
  'turnstile',
  'cf-challenge',
  'Just a moment',
  'cloudflare',
  'captcha',
  'vite',
  'nuxt',
  'next',
  'react',
  'tmdb',
  'imdb',
  'm3u8',
  'hls',
  '/api/',
]) {
  console.log(pat, (home.text.match(new RegExp(pat, 'gi')) || []).length)
}

const assets = [
  ...new Set(
    [...home.text.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)[^"']*)["']/gi)].map(
      (m) => m[1],
    ),
  ),
]
console.log('assets', assets.slice(0, 40))

const hrefs = [
  ...new Set([...home.text.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1])),
]
console.log(
  'interesting hrefs',
  hrefs
    .filter((h) => /movie|tv|watch|search|api|embed|play|title/i.test(h))
    .slice(0, 40),
)

const robots = await get('https://aether.bar/robots.txt')
fs.writeFileSync('tmp/aether-robots.txt', robots.text)
console.log('robots', robots.status, robots.text)

for (const u of [
  'https://aether.bar/api',
  'https://aether.bar/api/v1',
  'https://aether.bar/movie/27205',
  'https://aether.bar/movies/27205',
  'https://aether.bar/watch/movie/27205',
  'https://aether.bar/media/27205',
  'https://aether.bar/search?q=Inception',
]) {
  const r = await get(u)
  console.log(u, r.status, r.url.slice(0, 80), r.ct, r.text.slice(0, 120).replace(/\s+/g, ' '))
}
