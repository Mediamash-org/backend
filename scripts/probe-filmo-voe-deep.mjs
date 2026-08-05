import fs from 'fs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

// Fresh VOE embed follow from mint
function absorb(jar, headers) {
  const set =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie')]
        : []
  for (const c of set) {
    const part = c.split(';')[0]
    const eq = part.indexOf('=')
    if (eq > 0) jar.map[part.slice(0, eq)] = part.slice(eq + 1)
  }
  jar.cookieHeader = Object.entries(jar.map)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

async function get(url, jar, headers = {}) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      Cookie: jar.cookieHeader || '',
      ...headers,
    },
    redirect: 'manual',
  })
  absorb(jar, r.headers)
  const text = r.status >= 300 && r.status < 400 ? '' : await r.text()
  return {
    status: r.status,
    url: r.url,
    loc: r.headers.get('location'),
    text,
    ct: r.headers.get('content-type'),
  }
}

async function getFollow(url, jar, headers = {}, max = 8) {
  let cur = url
  for (let i = 0; i < max; i++) {
    const r = await get(cur, jar, headers)
    console.log('GET', r.status, cur.slice(0, 120), '->', r.loc?.slice(0, 120) || '')
    if (r.status >= 300 && r.status < 400 && r.loc) {
      cur = new URL(r.loc, cur).toString()
      continue
    }
    return { ...r, final: cur }
  }
}

const jar = { map: {}, cookieHeader: '' }
// mint interstellar
await getFollow('https://filmo.to/', jar)
const movie = await getFollow('https://filmo.to/movies/interstellar', jar)
const csrf = movie.text.match(/csrf-token" content="([^"]+)"/)?.[1]
const p = movie.text.match(/data-p="([^"]+)"/)?.[1]
const xsrf = decodeURIComponent(jar.map['XSRF-TOKEN'] || '')
const mint = await fetch('https://filmo.to/n', {
  method: 'POST',
  headers: {
    'User-Agent': UA,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-CSRF-TOKEN': csrf,
    'X-XSRF-TOKEN': xsrf,
    Cookie: jar.cookieHeader,
    Origin: 'https://filmo.to',
    Referer: 'https://filmo.to/movies/interstellar',
  },
  body: JSON.stringify({ p }),
})
absorb(jar, mint.headers)
const { x } = await mint.json()
console.log('token', x)

const embed = await getFollow(`https://filmo.to/n/${x}`, jar, {
  Referer: 'https://filmo.to/movies/interstellar',
})
const voeUrl =
  embed.text.match(/window\.location\.href\s*=\s*'([^']+)'/)?.[1] || embed.final
console.log('voe start', voeUrl)

const voeJar = { map: {}, cookieHeader: '' }
const voePage = await getFollow(voeUrl, voeJar, { Referer: 'https://filmo.to/' })
fs.writeFileSync('tmp/filmo-voe2.html', voePage.text)
console.log('final', voePage.final, 'len', voePage.text.length)

// fetch loader + site.min
const loaderSrc = voePage.text.match(/src="(\/js\/loader[^"]+)"/)?.[1]
const siteSrc = voePage.text.match(/src="(\/s\/js\/site\.min\.js[^"]+)"/)?.[1]
const base = new URL(voePage.final).origin
console.log('loader', loaderSrc, 'site', siteSrc)
for (const path of [loaderSrc, siteSrc].filter(Boolean)) {
  const r = await getFollow(new URL(path, base).toString(), voeJar, {
    Referer: voePage.final,
  })
  const name = path.split('/').pop().split('?')[0]
  fs.writeFileSync(`tmp/filmo-voe-${name}`, r.text)
  console.log('saved', name, r.text.length)
  for (const pat of ['m3u8', 'mp4', 'sources', 'hls', 'getSources', 'file', 'obfuscated', 'atob', 'btoa', 'decodeURI']) {
    console.log(name, pat, (r.text.match(new RegExp(pat, 'gi')) || []).length)
  }
}

// Look in HTML for JW config / json
const html = voePage.text
const jsonish = [...html.matchAll(/(\{["']?file["']?\s*:[\s\S]{0,200}\})/g)]
console.log('file objs', jsonish.slice(0, 5).map((m) => m[1].slice(0, 200)))
const mk = [...html.matchAll(/MKG[A-Za-z]+\([^)]*\)/g)].slice(0, 20)
console.log('MKG calls', mk.map((m) => m[0]))

// year / ids on movie page
console.log(
  'movie meta',
  [...movie.text.matchAll(/datetime="(\d{4})"|IMDb[^<]{0,40}|tt\d{7,}|tmdb|data-year|ft-meta[^>]*>[^<]+/gi)]
    .slice(0, 30)
    .map((m) => m[0].replace(/\s+/g, ' ').slice(0, 80)),
)
