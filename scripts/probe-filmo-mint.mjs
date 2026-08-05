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

async function sessionGet(url, jar) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html',
      Cookie: jar.cookieHeader || '',
      Referer: jar.referer || 'https://filmo.to/',
    },
  })
  absorbCookies(jar, r.headers)
  return { status: r.status, url: r.url, text: await r.text() }
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
  return { status: r.status, text: await r.text(), ct: r.headers.get('content-type') }
}

function extractProviders(html) {
  const re =
    /data-provider-chip[\s\S]{0,400}?data-movie-link-id="(\d+)"[\s\S]{0,200}?data-p="([^"]+)"|data-provider-chip[\s\S]{0,400}?data-p="([^"]+)"[\s\S]{0,200}?data-movie-link-id="(\d+)"/g
  const out = []
  for (const m of html.matchAll(re)) {
    out.push({
      id: m[1] || m[4],
      p: m[2] || m[3],
    })
  }
  // fallback: any data-p after provider-chip occurrences
  if (!out.length) {
    const idxs = []
    let i = 0
    while ((i = html.indexOf('data-provider-chip', i)) >= 0) {
      idxs.push(i)
      i += 1
    }
    for (const start of idxs) {
      const chunk = html.slice(start, start + 800)
      const id = chunk.match(/data-movie-link-id="(\d+)"/)?.[1]
      const p = chunk.match(/data-p="([^"]+)"/)?.[1]
      if (p) out.push({ id, p })
    }
  }
  // labels from nearby text
  return out
}

const jar = { map: {}, cookieHeader: '', referer: '' }
await sessionGet('https://filmo.to/', jar)
const movie = await sessionGet('https://filmo.to/movies/interstellar', jar)
jar.referer = movie.url
const csrf = movie.text.match(/csrf-token" content="([^"]+)"/)?.[1]
const providers = extractProviders(movie.text)
console.log('providers', providers.length, providers.map((p) => p.id))

// also extract display names near chips
const names = [...movie.text.matchAll(/data-provider-chip[\s\S]{0,1200}?<\/(?:button|a|div)>/gi)].map(
  (m) => m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100),
)
console.log('names sample', names.slice(0, 6))

for (const [idx, prov] of providers.entries()) {
  const mint = await sessionPost('https://filmo.to/n', jar, { p: prov.p }, csrf)
  console.log(`\n#${idx} link=${prov.id} mint=${mint.status} ${mint.text.slice(0, 180)}`)
  let token
  try {
    token = JSON.parse(mint.text).x
  } catch {}
  if (!token) continue
  const embed = await sessionGet(`https://filmo.to/n/${encodeURIComponent(token)}`, jar)
  fs.writeFileSync(`tmp/filmo-embed-${prov.id}.html`, embed.text)
  console.log('embed', embed.status, embed.url, 'len', embed.text.length)
  const urls = [...new Set([...embed.text.matchAll(/https?:\/\/[^"'\\\s<>]+/g)].map((m) => m[0]))]
  console.log('urls', urls.slice(0, 25))
  const iframes = [...embed.text.matchAll(/<iframe[^>]+>/gi)].map((m) => m[0])
  console.log('iframes', iframes.slice(0, 5))
  const srcs = [...embed.text.matchAll(/(?:src|file|url|source)=["']([^"']+)["']/gi)].map((m) => m[1])
  console.log('srcs', srcs.slice(0, 20))
  console.log('head', embed.text.slice(0, 600).replace(/\s+/g, ' '))
  if (idx >= 2) break
}
