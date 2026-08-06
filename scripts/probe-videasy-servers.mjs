const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
const HEADERS = {
  Accept: '*/*',
  Origin: 'https://player.videasy.to',
  Referer: 'https://player.videasy.to/',
  'User-Agent': UA,
}

const BASE = 'https://api.speedracelight.com'
const servers = [
  'cdn',
  'm4uhd',
  'vsrc',
  'hdmovie',
  'meine',
  'lamovie',
  'superflix',
  'jett',
  'tejo',
  'ym',
  'downloader2',
  'neon2',
]

async function decryptSources({ title, type, year, imdb, tmdb, season = 1, episode = 1, server }) {
  const encTitle = encodeURIComponent(encodeURIComponent(title))
  const seedRes = await fetch(`${BASE}/seed?mediaId=${tmdb}`, { headers: HEADERS })
  const seedJson = await seedRes.json()
  const seed = seedJson.seed
  const url =
    `${BASE}/${server}/sources-with-title?title=${encTitle}` +
    `&mediaType=${type}&year=${year}&episodeId=${episode}&seasonId=${season}` +
    `&tmdbId=${tmdb}&imdbId=${imdb}&enc=2&seed=${encodeURIComponent(seed)}`
  const encRes = await fetch(url, { headers: HEADERS })
  const text = await encRes.text()
  if (!encRes.ok) return { ok: false, status: encRes.status, text: text.slice(0, 120) }
  const dec = await fetch('https://enc-dec.app/api/dec-videasy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text, id: String(tmdb), seed }),
  })
  const dj = await dec.json()
  if (dj.status !== 200) return { ok: false, status: dj.status, text: JSON.stringify(dj).slice(0, 200) }
  return { ok: true, seed, data: dj.result }
}

async function probeUrl(url, label) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        Referer: 'https://player.videasy.to/',
        Origin: 'https://player.videasy.to',
      },
      redirect: 'follow',
    })
    const buf = Buffer.from(await r.arrayBuffer())
    const head = buf.subarray(0, 120).toString('utf8')
    console.log(
      ' ',
      label,
      r.status,
      r.headers.get('content-type'),
      'bytes',
      buf.length,
      JSON.stringify(head.slice(0, 80)),
    )
  } catch (e) {
    console.log(' ', label, 'ERR', e.message)
  }
}

const movie = {
  title: 'Inception',
  type: 'movie',
  year: '2010',
  imdb: 'tt1375666',
  tmdb: '27205',
}

console.log('=== MOVIE servers ===')
for (const server of servers) {
  try {
    const out = await decryptSources({ ...movie, server })
    if (!out.ok) {
      console.log(server, 'FAIL', out.status, out.text)
      continue
    }
    const sources = out.data?.sources || []
    const subs = out.data?.subtitles || []
    console.log(
      server,
      'OK sources',
      sources.length,
      sources.map((s) => s.quality).join(','),
      'subs',
      subs.length,
    )
    if (sources[0]) await probeUrl(sources[0].url, `${server}/${sources[0].quality}`)
  } catch (e) {
    console.log(server, 'ERR', e.message)
  }
}

console.log('\n=== TV GoT ===')
const tv = {
  title: 'Game of Thrones',
  type: 'tv',
  year: '2011',
  imdb: 'tt0944947',
  tmdb: '1399',
  season: 1,
  episode: 1,
}
for (const server of ['cdn', 'm4uhd', 'vsrc', 'hdmovie']) {
  try {
    const out = await decryptSources({ ...tv, server })
    if (!out.ok) {
      console.log(server, 'FAIL', out.status, out.text)
      continue
    }
    const sources = out.data?.sources || []
    console.log(server, 'OK', sources.map((s) => `${s.quality}:${String(s.url).slice(0, 60)}`))
    if (sources[0]) await probeUrl(sources[0].url, `${server}/${sources[0].quality}`)
  } catch (e) {
    console.log(server, 'ERR', e.message)
  }
}

// also check api.videasy.net
console.log('\n=== api.videasy.net ===')
for (const u of [
  'https://api.videasy.net/',
  'https://api.videasy.net/movie/27205',
  'https://api.videasy.net/sources?tmdbId=27205&mediaType=movie',
]) {
  try {
    const r = await fetch(u, { headers: HEADERS })
    console.log(u, r.status, (await r.text()).slice(0, 200))
  } catch (e) {
    console.log(u, e.message)
  }
}
