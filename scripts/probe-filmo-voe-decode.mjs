import fs from 'fs'

const html = fs.readFileSync('tmp/filmo-voe2.html', 'utf8')
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
const packed = scripts.find((s) => s.includes('!!$') || s.includes('!!GUp') || s.trimStart().startsWith('["'))
fs.writeFileSync('tmp/filmo-voe-packed.js', packed || '')
console.log('packed len', packed?.length)

const big = scripts.sort((a, b) => b.length - a.length)[0]
const loader = fs.readFileSync('tmp/filmo-voe-loader.a40897e.js', 'utf8')

for (const [label, text] of [
  ['big', big],
  ['loader', loader],
]) {
  console.log('\n===', label, '===')
  for (const pat of [
    'hls',
    'm3u8',
    'mp4',
    'sources',
    'atob(',
    'fromCharCode',
    'direct_access_url',
    'source',
    'video_url',
  ]) {
    let from = 0
    let n = 0
    while (n < 2) {
      const i = text.indexOf(pat, from)
      if (i < 0) break
      console.log(pat, '@', i, text.slice(i, i + 180).replace(/\s+/g, ' '))
      from = i + pat.length
      n++
    }
  }
}

const id = 'xcewht60qhjb'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
for (const u of [
  `https://jessicachoosemake.com/api/info/${id}`,
  `https://voe.sx/api/info/${id}`,
  `https://jessicachoosemake.com/engine/ajax.php?alias=${id}`,
  `https://voe.sx/e/${id}`,
]) {
  try {
    const r = await fetch(u, {
      headers: { 'User-Agent': UA, Referer: `https://jessicachoosemake.com/e/${id}` },
      redirect: 'follow',
    })
    const t = await r.text()
    console.log(u, r.status, r.url.slice(0, 80), t.slice(0, 100).replace(/\s+/g, ' '))
  } catch (e) {
    console.log(u, e.message)
  }
}

// Check movie page for structured data / year for matching
const movie = fs.readFileSync('tmp/filmo-interstellar.html', 'utf8')
console.log('\ncanonical', movie.match(/rel="canonical" href="([^"]+)"/)?.[1])
console.log('og:title', movie.match(/property="og:title" content="([^"]+)"/)?.[1])
console.log('json-ld', (movie.match(/application\/ld\+json/g) || []).length)
const year = movie.match(/ft-meta-label[^>]*>\s*(20\d{2})\s*</)?.[1]
console.log('year', year)
