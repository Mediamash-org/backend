import fs from 'fs'

const UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36'

async function get(url, headers = {}) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
    redirect: 'follow',
  })
  const text = await r.text()
  return { status: r.status, url: r.url, ct: r.headers.get('content-type'), text }
}

const list = await (
  await fetch('https://manoda.co/v1/api/videos?type=hollywood&channel=pikashow', {
    headers: { 'user-agent': 'Pikashow/2509030', Accept: 'application/json' },
  })
).json()

const inception = list.records.find((m) => /inception/i.test(m.t))
fs.writeFileSync('tmp/pikashow-inception-list.json', JSON.stringify(inception, null, 2))
console.log(JSON.stringify(inception, null, 2))

for (const cu of inception.clientUrls || []) {
  console.log('\n===', cu.label, cu.url)
  const r = await get(cu.url, {
    Referer: 'https://samui390dod.com/',
    Origin: 'https://samui390dod.com',
  })
  console.log(r.status, r.ct, r.url.slice(0, 100), r.text.slice(0, 250).replace(/\s+/g, ' '))
}

// player page
console.log('\n=== player ===')
const player = await get(inception.url, {
  Referer: 'https://samui390dod.com/',
  'X-Requested-With': 'com.offshore.pikachu',
})
fs.writeFileSync('tmp/pikashow-player.html', player.text)
console.log(player.status, player.url, player.text.length)
console.log(player.text.slice(0, 500).replace(/\s+/g, ' '))
for (const pat of ['HDVBPlayer', 'm3u8', 'file', 'playlist', 'jwplayer']) {
  console.log(pat, (player.text.match(new RegExp(pat, 'gi')) || []).length)
}

// series list item - any stream urls?
const series = await (
  await fetch('https://manoda.co/v1/api/videos?type=series&channel=pikashow', {
    headers: { 'user-agent': 'Pikashow/2509030', Accept: 'application/json' },
  })
).json()
const bb = series.series.find((s) => /breaking bad/i.test(s.t))
fs.writeFileSync('tmp/pikashow-bb-list.json', JSON.stringify(bb, null, 2))
console.log('\nbb keys', bb && Object.keys(bb))
