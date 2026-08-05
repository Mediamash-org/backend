import { writeFileSync } from 'node:fs'

const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const headers = {
  'User-Agent': ua,
  Accept: 'application/json, text/html, */*',
  Referer: 'https://streamingunity.vip/',
  Origin: 'https://streamingunity.vip',
}

function parseDataPage(html) {
  const m = html.match(/data-page="([^"]+)"/)
  if (!m) return null
  return JSON.parse(m[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
}

const search = await (
  await fetch('https://streamingunity.vip/en/search?q=Inception', { headers })
).json()
console.log('search first', JSON.stringify(search.data?.[0], null, 2))

const id = search.data[0].id
const slug = search.data[0].slug

const titleHtml = await (
  await fetch(`https://streamingunity.vip/en/titles/${id}-${slug}`, {
    headers: { ...headers, Accept: 'text/html' },
  })
).text()
const titlePage = parseDataPage(titleHtml)
const t = titlePage.props.title
console.log('title ids', {
  id: t.id,
  tmdb_id: t.tmdb_id,
  imdb_id: t.imdb_id,
  scws_id: t.scws_id,
  type: t.type,
})

const iframeHtml = await (
  await fetch(`https://streamingunity.vip/en/iframe/${id}`, {
    headers: { ...headers, Accept: 'text/html' },
  })
).text()
const embed = iframeHtml
  .match(/src="(https:\/\/vixcloud\.co\/embed\/[^"]+)"/)?.[1]
  ?.replaceAll('&amp;', '&')
console.log('embed', embed)

const embedRes = await fetch(embed, {
  headers: { ...headers, Accept: 'text/html', Referer: 'https://streamingunity.vip/' },
})
const embedHtml = await embedRes.text()
console.log('embed http', embedRes.status, 'len', embedHtml.length)
writeFileSync('tmp/su-vixcloud-embed.html', embedHtml)

for (const k of ['m3u8', 'playlist', 'masterPlaylist', 'window.', 'token', 'source', 'video', 'json']) {
  const re = new RegExp(`.{0,50}${k}.{0,100}`, 'gi')
  const hits = [...embedHtml.matchAll(re)].slice(0, 4).map((x) => x[0].replace(/\s+/g, ' '))
  if (hits.length) {
    console.log('\nKEY', k)
    for (const h of hits) console.log(' ', h)
  }
}

const scripts = [...embedHtml.matchAll(/src=["']([^"']+)["']/gi)].map((m) => m[1])
console.log('\nscripts', scripts)

// Also try TMDB-oriented search / archive filter if any
for (const url of [
  'https://streamingunity.vip/en/search?q=27205',
  'https://streamingunity.vip/en/search?q=tt1375666',
  'https://streamingunity.vip/en/archive?type=movie&search=Inception',
]) {
  const r = await fetch(url, { headers })
  const j = await r.json().catch(() => null)
  console.log('\n', url, 'count', j?.data?.length, 'first', j?.data?.[0]?.name, j?.data?.[0]?.id)
}
