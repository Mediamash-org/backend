import fs from 'fs'

const index = fs.readFileSync('tmp/aether-index-GP4wrADd.js', 'utf8')

// Find scrape URL builder and provider list
const i = index.indexOf('function Cs(e)')
console.log('Cs', index.slice(i, i + 1200))

const j = index.indexOf('scrapeSource')
console.log('\nscrapeSource uses', index.slice(j - 300, j + 800))

// Look for provider ids / scraper names
for (const pat of [
  'febbox',
  'fedapi',
  'vidsrc',
  'embed',
  'sourceId',
  'sources:',
  'id:"',
  'type:"source"',
  'type:"embed"',
]) {
  /* skip noisy */
}

// Find catalog of scrapers - often mw-provider style
const k = index.indexOf('type:"source"')
console.log('\ntype source', k, index.slice(k - 100, k + 400))

let from = 0
let n = 0
while (n < 15) {
  const p = index.indexOf('type:"source"', from)
  if (p < 0) break
  console.log('---', index.slice(p - 80, p + 200).replace(/\s+/g, ' '))
  from = p + 10
  n++
}

from = 0
n = 0
console.log('\nembeds:')
while (n < 15) {
  const p = index.indexOf('type:"embed"', from)
  if (p < 0) break
  console.log('---', index.slice(p - 80, p + 200).replace(/\s+/g, ' '))
  from = p + 10
  n++
}

// How destination proxy works
const p = index.indexOf('destination:')
console.log('\ndestination', index.slice(p - 200, p + 400))
