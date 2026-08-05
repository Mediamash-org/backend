import crypto from 'crypto'
import fs from 'fs'

const UA =
  'Pikashow/2509030 (Android 13; Pixel 5; Channel/pikashow; gaid/test-gaid); Uuid/test-uuid'

function headers(apiKey = 'pikashow', secret = 'pikashow') {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${apiKey}:${timestamp}`)
    .digest('hex')
  return {
    Host: 'manoda.co',
    'user-agent': UA,
    'X-API-Key': apiKey,
    'X-Signature': signature,
    'X-Timestamp': timestamp,
    Accept: 'application/json',
  }
}

async function get(path, h = headers()) {
  const r = await fetch(`https://manoda.co${path}`, { headers: h })
  const text = await r.text()
  return { status: r.status, text }
}

// Search Inception in hollywood list
const list = await get('/v1/api/videos?type=hollywood&channel=pikashow')
const movies = JSON.parse(list.text).records || []
const inception = movies.find((m) => /inception/i.test(m.t || ''))
console.log('inception', inception)

// Also try bollywood + series for Interstellar / Breaking Bad
const series = JSON.parse(
  (await get('/v1/api/videos?type=series&channel=pikashow')).text,
).series
const bb = series?.find((s) => /breaking bad/i.test(s.t || ''))
console.log('breaking bad', bb && { t: bb.t, y: bb.y, n: bb.n, detail: bb.detail?.slice(0, 2) })

const interstellar = movies.find((m) => /interstellar/i.test(m.t || ''))
console.log('interstellar', interstellar && { so: interstellar.so, t: interstellar.t, y: interstellar.y, q: interstellar.q, url: interstellar.url })

const target = inception || interstellar || movies[movies.length - 1]
console.log('using', target?.t, target?.so)

if (target) {
  const qs = new URLSearchParams({
    type: 'hollywood',
    videoId: String(target.so),
    title: target.t,
    noseasons: '1',
    noepisodes: '0',
  })
  // with fake hmac
  const v1 = await get(`/v1/api/video?${qs}`)
  console.log('video hmac', v1.status, v1.text.slice(0, 500))
  fs.writeFileSync('tmp/pikashow-video.json', v1.text)

  // without auth
  const v2 = await get(`/v1/api/video?${qs}`, {
    'user-agent': UA,
    Accept: 'application/json',
  })
  console.log('video noauth', v2.status, v2.text.slice(0, 500))
}

if (bb) {
  const qs = new URLSearchParams({
    type: 'series',
    videoId: '0',
    title: bb.t,
    noseasons: '1',
    noepisodes: '1',
  })
  const ep = await get(`/v1/api/video?${qs}`)
  console.log('episode', ep.status, ep.text.slice(0, 600))
  fs.writeFileSync('tmp/pikashow-episode.json', ep.text)
}
