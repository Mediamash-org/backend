import fs from 'fs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const app = fs.readFileSync('tmp/filmo-app-C366ySK6.js', 'utf8')

// extract provider-frame related code chunks
const idx = app.indexOf('provider-frame')
console.log('provider-frame idx', idx)
for (const needle of [
  'provider-frame',
  'openMint',
  'data-p',
  'loadedP',
  'data-provider',
  'mint',
  'Provider',
]) {
  let from = 0
  let n = 0
  while (n < 5) {
    const i = app.toLowerCase().indexOf(needle.toLowerCase(), from)
    if (i < 0) break
    console.log(`\n--- ${needle} @${i} ---`)
    console.log(app.slice(Math.max(0, i - 200), i + 400).replace(/\s+/g, ' '))
    from = i + needle.length
    n++
  }
}

async function get(url, headers = {}) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*', ...headers },
    redirect: 'follow',
  })
  const text = await r.text()
  return { status: r.status, url: r.url, ct: r.headers.get('content-type'), text }
}

// known movie from homepage
const movie = await get('https://filmo.to/movies/interstellar')
fs.writeFileSync('tmp/filmo-interstellar.html', movie.text)
console.log('\ninterstellar', movie.status, movie.url, movie.text.length)

const movie2 = await get('https://filmo.to/movies/oppenheimer')
fs.writeFileSync('tmp/filmo-oppenheimer.html', movie2.text)
console.log('oppenheimer', movie2.status, movie2.url, movie2.text.length)

function inspectMovie(label, html) {
  console.log(`\n==== ${label} ====`)
  const provider = [...html.matchAll(/data-provider[^=]*="[^"]*"/g)].map((m) => m[0])
  console.log('provider attrs', provider.slice(0, 40))
  const dataP = [...html.matchAll(/data-p="[^"]*"/g)].map((m) => m[0])
  console.log('data-p', dataP.slice(0, 20))
  const movieId = [...html.matchAll(/data-movie-id="[^"]*"/g)].map((m) => m[0])
  console.log('movie-id', [...new Set(movieId)].slice(0, 10))
  const iframe = [...html.matchAll(/<iframe[\s\S]*?<\/iframe>|<iframe[^>]*>/gi)].map((m) => m[0])
  console.log('iframe', iframe.slice(0, 5))
  // look for imdb/tmdb
  for (const pat of ['imdb', 'tmdb', 'tt\\d+', 'provider', 'mint', '/n\\?', 'watch']) {
    const hits = [...html.matchAll(new RegExp(`.{0,40}${pat}.{0,60}`, 'gi'))].slice(0, 6)
    if (hits.length) {
      console.log(pat, hits.map((h) => h[0].replace(/\s+/g, ' ')))
    }
  }
  // any JSON blobs
  const json = [...html.matchAll(/window\.\w+\s*=\s*\{[\s\S]*?\};/g)].map((m) => m[0].slice(0, 300))
  console.log('window assigns', json)
}

inspectMovie('interstellar', movie.text)
inspectMovie('oppenheimer', movie2.text)

// probe mint endpoints
for (const u of [
  'https://filmo.to/n',
  'https://filmo.to/n?p=1',
  'https://filmo.to/n?movie=1',
  'https://filmo.to/n?id=1',
]) {
  const r = await get(u)
  console.log('mint', u, r.status, r.url, r.ct, r.text.slice(0, 200).replace(/\s+/g, ' '))
}

// search page body for movie cards differently
const search = fs.readFileSync('tmp/filmo-search-inception.html', 'utf8')
console.log('\nsearch contains inception?', /inception/i.test(search))
console.log(
  'search movies hrefs',
  [...search.matchAll(/\/movies\/[a-z0-9-]+/gi)].map((m) => m[0]).slice(0, 30),
)
console.log('search snippet around results')
const ri = search.toLowerCase().indexOf('inception')
console.log(ri, search.slice(Math.max(0, ri - 200), ri + 300).replace(/\s+/g, ' '))
