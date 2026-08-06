const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const BASE = 'https://azmovies.to'
const jar = {}

function absorb(headers) {
  const set =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie')]
        : []
  for (const c of set) {
    const part = c.split(';')[0]
    const i = part.indexOf('=')
    if (i > 0) jar[part.slice(0, i)] = part.slice(i + 1)
  }
}
function cookie() {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

async function ensureVerified(path = '/') {
  let res = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html', Cookie: cookie() },
    redirect: 'manual',
  })
  absorb(res.headers)
  if (![302, 303].includes(res.status)) return
  const loc = res.headers.get('location') || '/verify'
  const verifyUrl = new URL(loc, BASE).href
  res = await fetch(verifyUrl, {
    headers: { 'User-Agent': UA, Accept: 'text/html', Cookie: cookie() },
  })
  absorb(res.headers)
  const html = await res.text()
  const token = html.match(/verifyToken\s*=\s*"([^"]+)"/)?.[1]
  if (!token) throw new Error('no token')
  const verified = await fetch(`${BASE}/verified`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      Cookie: cookie(),
      Origin: BASE,
      Referer: verifyUrl,
    },
    body: JSON.stringify({ token }),
  })
  absorb(verified.headers)
  console.log('verified', await verified.text())
}

async function get(path) {
  await ensureVerified(path)
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html', Cookie: cookie() },
    redirect: 'follow',
  })
  absorb(res.headers)
  return res
}

function extractServers(html) {
  const out = []
  const re = /<button class="server-btn[^"]*"([\s\S]*?)>/gi
  let m
  while ((m = re.exec(html))) {
    const chunk = m[1]
    const get = (k) => chunk.match(new RegExp(`data-${k}="([^"]*)"`))?.[1]?.replace(/&amp;/g, '&')
    out.push({
      url: get('url'),
      server: get('server'),
      name: get('name'),
      quality: get('quality'),
      tmdb: get('tmdb'),
      special: get('special'),
    })
  }
  return out
}

async function main() {
  // known movie + popular title search via slug guess / search page
  const moviePath = process.argv[2] || '/movie/the-dink-aff4a'
  const res = await get(moviePath)
  const html = await res.text()
  console.log('movie', res.status, res.url)
  const servers = extractServers(html)
  console.log('servers', JSON.stringify(servers, null, 2))

  // also try search HTML for inception
  const search = await get('/search?q=inception')
  const shtml = await search.text()
  const links = [...new Set([...shtml.matchAll(/href="(\/movie\/[^"]+)"/g)].map((m) => m[1]))].filter(
    (h) => !h.includes('${'),
  )
  console.log('\nsearch inception links', links.slice(0, 10))

  // probe each embed host
  for (const s of servers) {
    if (!s.url) continue
    try {
      const er = await fetch(s.url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html',
          Referer: `${BASE}/`,
        },
        redirect: 'follow',
      })
      const et = await er.text()
      console.log(`\n### embed ${s.name}/${s.server}`, er.status, er.url)
      console.log(et.slice(0, 800).replace(/\s+/g, ' '))
      for (const n of ['m3u8', 'mp4', 'sources', 'file:', 'playlist', 'iframe', 'hls']) {
        const i = et.toLowerCase().indexOf(n)
        if (i >= 0) console.log(' hit', n, et.slice(Math.max(0, i - 80), i + 400).replace(/\s+/g, ' '))
      }
    } catch (e) {
      console.log('embed fail', s.url, e.message)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
