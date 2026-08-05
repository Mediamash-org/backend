import fs from 'fs'

const index = fs.readFileSync('tmp/aether-index-GP4wrADd.js', 'utf8')

function hits(pat, n = 8) {
  const re = new RegExp(`.{0,80}${pat}.{0,120}`, 'gi')
  return [...index.matchAll(re)].slice(0, n).map((m) => m[0].replace(/\s+/g, ' '))
}

for (const pat of [
  'scrape/source',
  'scrape/embed',
  'fembox',
  'febbox',
  'FEM',
  'aether\\.cx',
  'providers',
  'PROVIDERS',
  'makeProviders',
  'getStream',
  'embedScrapers',
  'sourceScrapers',
  'pstream',
  'proxyUrls',
  'PROXY_URL',
  'CORS_PROXY',
]) {
  const h = hits(pat)
  console.log(`\n=== ${pat} (${h.length}) ===`)
  h.forEach((x) => console.log(x))
}

// Extract config defaults object around M3U8_PROXY
const i = index.indexOf('M3U8_PROXY_URL')
console.log('\nM3U8 context', index.slice(i - 400, i + 600))

const j = index.indexOf('fembox.aether')
console.log('\nfembox context', index.slice(j - 200, j + 400))
