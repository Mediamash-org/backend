const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://player.videasy.to',
  Referer: 'https://player.videasy.to/',
  'User-Agent': UA,
}

function withTimeout(ms) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  return { signal: c.signal, done: () => clearTimeout(t) }
}

async function fetchText(url, opts = {}, ms = 12_000) {
  const { signal, done } = withTimeout(ms)
  try {
    const r = await fetch(url, { ...opts, signal })
    const text = await r.text()
    return { ok: r.ok, status: r.status, text }
  } finally {
    done()
  }
}

async function fetchHead(url, ms = 10_000) {
  const { signal, done } = withTimeout(ms)
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        Range: 'bytes=0-200',
        Referer: 'https://player.videasy.to/',
        Origin: 'https://player.videasy.to',
      },
      signal,
      redirect: 'follow',
    })
    const buf = Buffer.from(await r.arrayBuffer())
    return {
      status: r.status,
      ct: r.headers.get('content-type'),
      bytes: buf.length,
      head: buf.subarray(0, 80).toString('utf8'),
    }
  } catch (e) {
    return { error: e.message }
  } finally {
    done()
  }
}

async function decrypt(text, tmdb, seed) {
  const body = seed
    ? { text, id: String(tmdb), seed }
    : { text, id: String(tmdb) }
  const { signal, done } = withTimeout(15_000)
  try {
    const r = await fetch('https://enc-dec.app/api/dec-videasy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    return await r.json()
  } finally {
    done()
  }
}

async function getSeed(tmdb) {
  const res = await fetchText(
    `https://api.speedracelight.com/seed?mediaId=${tmdb}`,
    { headers: HEADERS },
    10_000,
  )
  return JSON.parse(res.text).seed
}

async function tryVideasyNet(name, path, media) {
  const qs = new URLSearchParams({
    title: media.title,
    mediaType: media.type,
    year: media.year,
    tmdbId: media.tmdb,
    imdbId: media.imdb || '',
  })
  if (media.type === 'tv') {
    qs.set('seasonId', String(media.season))
    qs.set('episodeId', String(media.episode))
  }
  const apiUrl = `https://api.videasy.net/${path}/sources-with-title?${qs}`
  const enc = await fetchText(apiUrl, { headers: HEADERS }, 12_000)
  if (!enc.ok || enc.text.length < 20 || enc.text.startsWith('<') || enc.text.trim().startsWith('{')) {
    console.log(name, 'SKIP', enc.status, enc.text.slice(0, 100))
    return
  }
  let dj = await decrypt(enc.text, media.tmdb)
  if (dj.status !== 200) {
    const seed = await getSeed(media.tmdb)
    dj = await decrypt(enc.text, media.tmdb, seed)
  }
  if (dj.status !== 200) {
    console.log(name, 'DEC FAIL', JSON.stringify(dj).slice(0, 160))
    return
  }
  const sources = dj.result?.sources || []
  console.log(name, 'OK', sources.length, sources.map((s) => s.quality).join(','))
  if (sources[0]?.url) console.log('  play', await fetchHead(sources[0].url))
}

async function trySpeed(name, path, media) {
  const seed = await getSeed(media.tmdb)
  const qs = new URLSearchParams({
    title: encodeURIComponent(media.title), // will be encoded again by URLSearchParams...
    mediaType: media.type,
    year: media.year,
    episodeId: String(media.episode || 1),
    seasonId: String(media.season || 1),
    tmdbId: media.tmdb,
    imdbId: media.imdb || '',
    enc: '2',
    seed,
  })
  // URLSearchParams encodes once; we need title double-encoded like the sample.
  qs.set('title', encodeURIComponent(media.title))
  const apiUrl = `https://api.speedracelight.com/${path}/sources-with-title?${qs}`
  const enc = await fetchText(apiUrl, { headers: HEADERS }, 12_000)
  if (!enc.ok || enc.text.length < 20 || enc.text.trim().startsWith('{')) {
    console.log(name, 'SKIP', enc.status, enc.text.slice(0, 100))
    return
  }
  const dj = await decrypt(enc.text, media.tmdb, seed)
  if (dj.status !== 200) {
    console.log(name, 'DEC FAIL', JSON.stringify(dj).slice(0, 160))
    return
  }
  const sources = dj.result?.sources || []
  console.log(name, 'OK', sources.length, sources.map((s) => s.quality).join(','))
  if (sources[0]?.url) console.log('  play', await fetchHead(sources[0].url))
}

const movie = {
  title: 'Inception',
  type: 'movie',
  year: '2010',
  imdb: 'tt1375666',
  tmdb: '27205',
}

const netServers = {
  Neon: 'myflixerzupcloud',
  Yoru: 'cdn',
  Cypher: 'moviebox',
  Reyna: 'primewire',
  Omen: 'onionplay',
  Breach: 'm4uhd',
  Ghost: 'primesrcme',
  Sage: '1movies',
  Vyse: 'hdmovie',
  Raze: 'superflix',
}

console.log('=== api.videasy.net ===')
for (const [name, path] of Object.entries(netServers)) {
  try {
    await tryVideasyNet(name, path, movie)
  } catch (e) {
    console.log(name, 'ERR', e.message)
  }
}

console.log('\n=== speedracelight ===')
for (const [name, path] of Object.entries({
  cdn: 'cdn',
  m4uhd: 'm4uhd',
  vsrc: 'vsrc',
  hdmovie: 'hdmovie',
  meine: 'meine',
  lamovie: 'lamovie',
  superflix: 'superflix',
})) {
  try {
    await trySpeed(name, path, movie)
  } catch (e) {
    console.log(name, 'ERR', e.message)
  }
}

console.log('\n=== TV ===')
const tv = {
  title: 'Game of Thrones',
  type: 'tv',
  year: '2011',
  imdb: 'tt0944947',
  tmdb: '1399',
  season: 1,
  episode: 1,
}
for (const [name, path] of Object.entries({ Breach: 'm4uhd', Neon: 'myflixerzupcloud' })) {
  try {
    await tryVideasyNet(name, path, tv)
  } catch (e) {
    console.log(name, 'ERR', e.message)
  }
}
for (const [name, path] of Object.entries({ cdn: 'cdn', m4uhd: 'm4uhd' })) {
  try {
    await trySpeed(name, path, tv)
  } catch (e) {
    console.log(name, 'ERR', e.message)
  }
}
