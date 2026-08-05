import fs from 'fs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function parseSetCookie(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const one = headers.get('set-cookie')
  return one ? [one] : []
}

function absorbCookies(jar, headers) {
  for (const c of parseSetCookie(headers)) {
    const part = c.split(';')[0]
    const eq = part.indexOf('=')
    if (eq < 0) continue
    jar.map[part.slice(0, eq)] = part.slice(eq + 1)
  }
  jar.cookieHeader = Object.entries(jar.map)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

async function sessionGet(url, jar, headers = {}) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,*/*',
      Cookie: jar.cookieHeader || '',
      Referer: jar.referer || 'https://filmo.to/',
      ...headers,
    },
    redirect: 'follow',
  })
  absorbCookies(jar, r.headers)
  return {
    status: r.status,
    url: r.url,
    text: await r.text(),
    ct: r.headers.get('content-type'),
  }
}

async function sessionPost(url, jar, body, csrf) {
  const xsrf = decodeURIComponent(jar.map['XSRF-TOKEN'] || '')
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': csrf || '',
      'X-XSRF-TOKEN': xsrf,
      Origin: 'https://filmo.to',
      Referer: jar.referer || 'https://filmo.to/',
      Cookie: jar.cookieHeader || '',
    },
    body: JSON.stringify(body),
  })
  absorbCookies(jar, r.headers)
  return { status: r.status, text: await r.text() }
}

function extractProviders(html) {
  const out = []
  let i = 0
  while ((i = html.indexOf('data-provider-chip', i)) >= 0) {
    const chunk = html.slice(i, i + 1200)
    const id = chunk.match(/data-movie-link-id="(\d+)"/)?.[1]
    const p = chunk.match(/data-p="([^"]+)"/)?.[1]
    // try to get visible label text after chip open tag
    const label =
      chunk.match(/>([^<]{1,40})</)?.[1]?.trim() ||
      chunk.match(/aria-label="([^"]+)"/)?.[1] ||
      ''
    if (p) out.push({ id, p, label })
    i += 18
  }
  return out
}

const jar = { map: {}, cookieHeader: '', referer: '' }
await sessionGet('https://filmo.to/', jar)

for (const slug of ['interstellar', 'oppenheimer', 'spider-man-a-new-universe']) {
  const movie = await sessionGet(`https://filmo.to/movies/${slug}`, jar)
  jar.referer = movie.url
  const csrf = movie.text.match(/csrf-token" content="([^"]+)"/)?.[1]
  const providers = extractProviders(movie.text)
  console.log(`\n=== ${slug} status=${movie.status} providers=${providers.length} ===`)
  // unique link ids
  console.log('link ids', [...new Set(providers.map((p) => p.id))])
  console.log('labels', providers.map((p) => p.label))

  // chip surrounding HTML for hoster names
  const around = movie.text.indexOf('data-provider-chip')
  if (around >= 0) {
    console.log('chip context', movie.text.slice(around - 200, around + 400).replace(/\s+/g, ' '))
  }

  for (const prov of providers.slice(0, 6)) {
    const mint = await sessionPost('https://filmo.to/n', jar, { p: prov.p }, csrf)
    let data
    try {
      data = JSON.parse(mint.text)
    } catch {
      console.log('mint fail', mint.status, mint.text.slice(0, 120))
      continue
    }
    const embed = await sessionGet(`https://filmo.to/n/${encodeURIComponent(data.x)}`, jar)
    const redirectTo =
      embed.text.match(/window\.location\.href\s*=\s*'([^']+)'/)?.[1] ||
      embed.url
    console.log(`  link=${prov.id} label=${prov.label} -> ${redirectTo}`)
  }
}

// Follow VOE page for stream
console.log('\n=== VOE page ===')
const voeJar = { map: {}, cookieHeader: '', referer: 'https://filmo.to/' }
const voe = await sessionGet(
  'https://jessicachoosemake.com/e/xcewht60qhjb?default_audio_language=en',
  voeJar,
  { Referer: 'https://filmo.to/' },
)
fs.writeFileSync('tmp/filmo-voe.html', voe.text)
console.log('voe', voe.status, voe.url, voe.text.length)
for (const pat of ['m3u8', 'mp4', 'sources', 'hls', 'jwplayer', 'player', 'file:', 'obf', 'base64']) {
  console.log(pat, (voe.text.match(new RegExp(pat, 'gi')) || []).length)
}
const urls = [...new Set([...voe.text.matchAll(/https?:\/\/[^"'\\\s<>]+/g)].map((m) => m[0]))]
console.log(
  'interesting urls',
  urls.filter((u) => /m3u8|mp4|cdn|stream|delivery|video/i.test(u)).slice(0, 30),
)
// look for encoded payloads
const scripts = [...voe.text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
console.log(
  'script sizes',
  scripts.map((s) => s.length),
)
scripts.forEach((s, i) => {
  if (/m3u8|sources|hls|atob|btoa|MKG|file/i.test(s)) {
    console.log(`script${i}`, s.slice(0, 500).replace(/\s+/g, ' '))
  }
})
