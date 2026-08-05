import fs from 'fs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const index = fs.readFileSync('tmp/aether-index-GP4wrADd.js', 'utf8')

// Find how Mi() / proxy base is chosen and scrape host
for (const needle of ['function Mi(', 'function hm(', 'function dm(', 'function um(', 'Zu()', 'Ti()', '/scrape']) {
  const i = index.indexOf(needle)
  console.log(`\n=== ${needle} @${i} ===`)
  if (i >= 0) console.log(index.slice(i, i + 700).replace(/\s+/g, ' '))
}

async function get(url, headers = {}) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
  })
  const text = await r.text()
  return { status: r.status, ct: r.headers.get('content-type'), text, url: r.url }
}

const media = {
  type: 'movie',
  title: 'Inception',
  releaseYear: '2010',
  tmdbId: '27205',
  imdbId: 'tt1375666',
}

const qs = new URLSearchParams({
  type: media.type,
  title: media.title,
  releaseYear: media.releaseYear,
  tmdbId: media.tmdbId,
  imdbId: media.imdbId,
})

const bases = [
  'https://backend.aether.bar',
  'https://rem.aether.bar',
  'https://jbam.aether.bar',
  'https://bifice.aether.bar',
  'https://wood.aether.bar',
  'https://aviv.aether.bar',
  'https://r1.aether.cx',
  'https://r2.aether.cx',
]

console.log('\n=== scrape endpoints ===')
for (const base of bases) {
  for (const path of [`/scrape?${qs}`, `/scrape/source?${qs}&id=febbox`, `/`]) {
    try {
      const r = await get(`${base}${path}`)
      console.log(base + path.slice(0, 40), r.status, r.ct, r.text.slice(0, 140).replace(/\s+/g, ' '))
    } catch (e) {
      console.log(base, e.message)
    }
  }
}

// fembox without token variants
console.log('\n=== fembox ===')
for (const u of [
  'https://fembox.aether.bar/movie/27205?ui=test',
  'https://fembox.aether.bar/quota?ui=test',
  'https://fembox.aether.bar/docs',
  'https://fembox.aether.bar/openapi.json',
]) {
  const r = await get(u)
  console.log(u, r.status, r.text.slice(0, 160).replace(/\s+/g, ' '))
}
