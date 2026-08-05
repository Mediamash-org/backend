import fs from 'fs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function get(url, opts = {}) {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      Accept: opts.accept || 'text/html,application/json,*/*',
      ...(opts.headers || {}),
    },
  })
  const buf = Buffer.from(await r.arrayBuffer())
  const text = buf.toString('utf8')
  return { status: r.status, url: r.url, headers: Object.fromEntries(r.headers), text, buf }
}

function save(name, text) {
  fs.writeFileSync(`tmp/${name}`, text)
  console.log('saved', name, text.length)
}

const movieUrl = 'https://filmo.to/movies/inception'
const inception = await get(movieUrl)
save('filmo-inception.html', inception.text)
console.log('movie', inception.status, inception.url)

const csrf = inception.text.match(/csrf-token" content="([^"]+)"/)?.[1]
console.log('csrf', csrf)

// extract links / iframes / video
const hrefs = [...inception.text.matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1])
console.log(
  'movie links',
  [...new Set(hrefs)].filter((h) => /watch|play|stream|embed|player|video|n\/|api/i.test(h)).slice(0, 40),
)
const iframes = [...inception.text.matchAll(/<iframe[^>]+>/gi)].map((m) => m[0])
console.log('iframes', iframes.slice(0, 10))
const dataAttrs = [...inception.text.matchAll(/data-(?:src|url|stream|id|movie|tmdb|imdb)[^=]*=["'][^"']+["']/gi)]
console.log('data attrs', dataAttrs.map((m) => m[0]).slice(0, 30))

for (const pat of ['m3u8', 'mp4', 'hls', 'plyr', 'video', 'embed', 'player', 'stream', 'tmdb', 'imdb', '/n', 'openMint', 'watch']) {
  console.log(pat, (inception.text.match(new RegExp(pat, 'gi')) || []).length)
}

const inline = [...inception.text.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
inline.forEach((s, i) => {
  if (s.trim()) console.log(`inline${i}`, s.slice(0, 800))
})

// search endpoints
for (const u of [
  'https://filmo.to/search?q=Inception',
  'https://filmo.to/search?query=Inception',
  'https://filmo.to/movies?q=Inception',
  'https://filmo.to/movies?search=Inception',
  'https://filmo.to/api/search?q=Inception',
  'https://filmo.to/api/movies/search?q=Inception',
]) {
  const r = await get(u, { accept: 'application/json, text/html' })
  console.log('search', u, r.status, r.url, r.text.slice(0, 120).replace(/\s+/g, ' '))
  save(`filmo-search-${Buffer.from(u).toString('base64url').slice(0, 24)}.txt`, r.text.slice(0, 5000))
}

// switch to EN
const en = await get('https://filmo.to/lang/en?redirect=%2Fmovies%2Finception')
save('filmo-en-inception.html', en.text)
console.log('en movie', en.status, en.url, en.text.slice(0, 200).replace(/\s+/g, ' '))

// download JS bundles and grep
const jsUrls = [
  'https://filmo.to/build/assets/app-C366ySK6.js',
  'https://filmo.to/build/assets/ui-vendor-DAPoJqkj.js',
]
for (const u of jsUrls) {
  const r = await get(u, { accept: '*/*' })
  const name = u.split('/').pop()
  save(`filmo-${name}`, r.text)
}
