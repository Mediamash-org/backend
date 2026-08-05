import fs from 'fs'

const index = fs.readFileSync('tmp/aether-index-GP4wrADd.js', 'utf8')

// Find provider package / scraper ids
for (const pat of [
  '@movie-web',
  'providers-cli',
  'makeStandardFetcher',
  'getMedia',
  'runAllProviders',
  'targets:',
  'scrapers',
  'vidsrc',
  'embedSu',
  'smashystream',
  'autoembed',
  'nsbx',
  'whvx',
  'feishin',
  'showbox',
  'nebula',
]) {
  const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  const count = (index.match(re) || []).length
  if (count) console.log(pat, count)
}

// Look near metadata flat / provider list load
const i = index.indexOf('/metadata')
console.log('\nmetadata', index.slice(i - 200, i + 500))

// How default scrape works without extension
const j = index.indexOf('scrapeAll')
console.log('\nscrapeAll call sites')
let from = 0
for (let n = 0; n < 8; n++) {
  const p = index.indexOf('scrapeAll', from)
  if (p < 0) break
  console.log('---', index.slice(p - 100, p + 250).replace(/\s+/g, ' '))
  from = p + 8
}

// Look for api type worker URLs usage
const k = index.indexOf('type:"api"')
console.log('\napi type', index.slice(k - 150, k + 300))

// Check config.js override effect - empty CORS means baked-in defaults from zu object still used via De()
const config = fs.readFileSync('tmp/aether-config.js', 'utf8')
console.log('\nconfig.js', config)

// De() function: window.__CONFIG__ VITE_ overrides, else baked defaults
const d = index.indexOf('function De(e,s)')
console.log('\nDe', index.slice(d, d + 250))
const yu = index.indexOf('function Yu(e)')
console.log('\nYu', index.slice(yu, yu + 350))
