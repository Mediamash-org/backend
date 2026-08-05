import { readFileSync, writeFileSync } from 'node:fs'

const t = readFileSync('tmp/bingr-Watch-_CRqr0Yz.js', 'utf8')
const idx = t.indexOf('let l=v;if(n===`movie`')
console.log('assign at', idx)

// Find import of v,F from module - look backwards for function ye dependencies
// Search for F= and v= assignments that look like server maps
const candidates = []
for (const m of t.matchAll(/\b([FvP])=(\{[^;]{10,400}\}|\[[^\]]{5,200}\])/g)) {
  candidates.push({ name: m[1], val: m[2].slice(0, 300) })
}
console.log('candidates', candidates.length)
for (const c of candidates.slice(0, 30)) console.log(c.name, c.val)

// Broader: any object with s12 or Quasar keys
for (const m of t.matchAll(/\{[^{}]{0,30}s12[^{}]{0,200}\}/g)) {
  console.log('s12obj', m[0])
}
for (const m of t.matchAll(/Quasar[^,]{0,80}/g)) {
  console.log('Q', m[0])
}

// Look at start of file for imports - often F and v come from same module
console.log('\nFILE HEAD', t.slice(0, 800))

// Grep-like for scraper name strings common in such sites
const names = [
  'Quasar',
  'Flicky',
  'VidSrc',
  'VidLink',
  'Smashy',
  'AutoEmbed',
  '2Embed',
  'MultiEmbed',
  'SuperEmbed',
  'Rabbit',
  'HydraHD',
  'MoviesAPI',
  'PrimeWire',
  's12',
  's11',
  's10',
  's9',
  's8',
  's7',
  's6',
  's5',
  's4',
  's3',
  's2',
  's1',
]
const found = {}
for (const n of names) {
  const count = t.split(n).length - 1
  if (count) found[n] = count
}
console.log('\nname counts', found)

writeFileSync('tmp/bingr-servers-hunt.txt', JSON.stringify({ candidates: candidates.slice(0, 50), found }, null, 2))
