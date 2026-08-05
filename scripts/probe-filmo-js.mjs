import fs from 'fs'

const app = fs.readFileSync('tmp/filmo-app-C366ySK6.js', 'utf8')
const vendor = fs.readFileSync('tmp/filmo-ui-vendor-DAPoJqkj.js', 'utf8')

function findUrls(label, text) {
  const urls = [
    ...new Set(
      [...text.matchAll(/["'`]((?:https?:)?\/\/[^"'`\s]{4,}|\/[a-zA-Z0-9_./?-]{3,})["'`]/g)].map(
        (m) => m[1],
      ),
    ),
  ].filter((u) =>
    /api|stream|play|watch|mint|embed|video|hls|m3u8|movie|search|source|proxy|cdn|token/i.test(u),
  )
  console.log(`\n=== ${label} urls (${urls.length}) ===`)
  urls.slice(0, 120).forEach((u) => console.log(u))
}

function findStrings(label, text, pats) {
  console.log(`\n=== ${label} string hits ===`)
  for (const pat of pats) {
    const re = new RegExp(`.{0,60}${pat}.{0,80}`, 'gi')
    const hits = [...text.matchAll(re)].slice(0, 8).map((m) => m[0].replace(/\s+/g, ' '))
    console.log(`-- ${pat} (${hits.length})`)
    hits.forEach((h) => console.log(h))
  }
}

findUrls('app', app)
findUrls('vendor', vendor)
findStrings('app', app, [
  'openMint',
  '/n',
  'm3u8',
  'playlist',
  'stream',
  'source',
  'iframe',
  'embed',
  'tmdb',
  'imdb',
  'watchlist',
  'api/',
  'Bearer',
  'sanctum',
  'X-XSRF',
  'csrf',
  'player',
  'hls',
])

// parse search page for movie links
const search = await (
  await fetch('https://filmo.to/search?q=Inception', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
  })
).text()
fs.writeFileSync('tmp/filmo-search-inception.html', search)
const movieLinks = [
  ...new Set(
    [...search.matchAll(/href="(https:\/\/filmo\.to\/movies\/[^"#?]+)"/g)].map((m) => m[1]),
  ),
]
console.log('\nsearch movie links', movieLinks)

// also try XHR search headers
for (const accept of ['application/json', 'text/html', '*/*']) {
  const r = await fetch('https://filmo.to/search?q=Inception', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: accept,
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  const t = await r.text()
  console.log('xhr search', accept, r.status, r.headers.get('content-type'), t.slice(0, 150).replace(/\s+/g, ' '))
}
