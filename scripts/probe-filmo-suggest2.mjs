import fs from 'fs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function trySuggest(q) {
  const urls = [
    `https://filmo.to/search/suggest?q=${encodeURIComponent(q)}`,
    `https://filmo.to/search/suggest?query=${encodeURIComponent(q)}`,
    `https://filmo.to/search/suggest?term=${encodeURIComponent(q)}`,
    `https://filmo.to/search/suggest?search=${encodeURIComponent(q)}`,
  ]
  for (const u of urls) {
    const r = await fetch(u, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://filmo.to/',
      },
    })
    const t = await r.text()
    if (!t.includes('"movies":[]') && r.status === 200) {
      console.log('HIT', u, t.slice(0, 300))
      return
    }
  }
  // POST
  for (const body of [
    { q },
    { query: q },
    { term: q },
    { search: q },
  ]) {
    const r = await fetch('https://filmo.to/search/suggest', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://filmo.to/',
      },
      body: JSON.stringify(body),
    })
    const t = await r.text()
    console.log('POST', JSON.stringify(body), r.status, t.slice(0, 200))
  }
}

for (const q of ['Inception', 'Interstellar', 'Oppenheimer', 'Spider', 'Avatar', 'Hail Mary']) {
  console.log('\n===', q, '===')
  const r = await fetch(`https://filmo.to/search/suggest?q=${encodeURIComponent(q)}`, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://filmo.to/',
    },
  })
  const t = await r.text()
  console.log(r.status, t.slice(0, 400))
}

await trySuggest('Interstellar')

// VOE: dump relevant HTML parts
const voe = fs.readFileSync('tmp/filmo-voe.html', 'utf8')
console.log('\nvoe title', voe.match(/<title>[^<]+/)?.[0])
console.log('voe inputs', [...voe.matchAll(/<(?:input|meta)[^>]+>/gi)].slice(0, 30).map((m) => m[0]))
// look for base64-looking blobs
const b64 = [...voe.matchAll(/[A-Za-z0-9+/]{80,}={0,2}/g)].map((m) => m[0])
console.log('b64 count', b64.length, 'lens', b64.map((b) => b.length).slice(0, 10))
if (b64[0]) {
  try {
    const dec = Buffer.from(b64[0], 'base64').toString('utf8')
    console.log('b64[0] dec', dec.slice(0, 300))
  } catch {}
}
// script srcs
console.log(
  'script srcs',
  [...voe.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]),
)
