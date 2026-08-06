const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function dump(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html',
      Referer: 'https://azmovies.to/',
    },
  })
  const html = await res.text()
  console.log('\n========', url, res.status, 'len', html.length)
  const scripts = [...html.matchAll(/src=["']([^"']+\.js[^"']*)["']/g)].map((m) => m[1])
  console.log('scripts', scripts)
  for (const n of [
    'iframe',
    'm3u8',
    'mp4',
    '/api',
    'source',
    'server',
    'playlist',
    'hls',
    'fetch(',
    'player',
    'stream',
    'subtitle',
    'vidsrc',
    'videasy',
    'unlimited',
  ]) {
    const i = html.toLowerCase().indexOf(n.toLowerCase())
    if (i >= 0) {
      console.log(`\n--- ${n} @${i}`)
      console.log(html.slice(Math.max(0, i - 160), i + 900))
    }
  }
  return { html, scripts }
}

async function inspectJs(abs) {
  const js = await (await fetch(abs, { headers: { 'User-Agent': UA } })).text()
  console.log('\nJS', abs, 'len', js.length)
  const needles = [
    'https://',
    '/api/',
    'm3u8',
    'playlist',
    'stream',
    'sources',
    'subtitle',
    'tmdb',
    'fetch(',
    'axios',
    'beacon',
  ]
  for (const n of needles) {
    let from = 0
    let count = 0
    while (count < 4) {
      const i = js.toLowerCase().indexOf(n.toLowerCase(), from)
      if (i < 0) break
      const snip = js.slice(Math.max(0, i - 60), i + 280).replace(/\s+/g, ' ')
      // skip boring react/css noise for https://
      if (n === 'https://' && /fonts\.|google|gstatic|tmdb\.org\/t\/p|wsrv\.nl|umami|cloudflare/i.test(snip)) {
        from = i + n.length
        continue
      }
      console.log('--', n, i)
      console.log(snip)
      from = i + n.length
      count++
    }
  }
}

async function main() {
  const org = await dump('https://vidcore.org/embed/movie/27205')
  const net = await dump('https://vidcore.net/movie/27205')

  // also try RSC / flight request
  const flight = await fetch('https://vidcore.net/movie/27205', {
    headers: {
      'User-Agent': UA,
      Accept: 'text/x-component',
      RSC: '1',
      'Next-Router-State-Tree': '%5B%22%22%2C%7B%22children%22%3A%5B%22movie%22%2C%7B%22children%22%3A%5B%5B%22id%22%2C%2227205%22%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D',
      Referer: 'https://vidcore.net/movie/27205',
    },
  })
  const flightText = await flight.text()
  console.log('\nRSC', flight.status, flight.headers.get('content-type'), flightText.slice(0, 1500))

  for (const s of [...org.scripts, ...net.scripts].slice(0, 20)) {
    const abs = s.startsWith('http') ? s : new URL(s, s.includes('vidcore.org') ? 'https://vidcore.org' : 'https://vidcore.net').href
    if (!abs.includes('.js')) continue
    if (abs.includes('umami') || abs.includes('cloudflare') || abs.includes('polyfills')) continue
    await inspectJs(abs)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
