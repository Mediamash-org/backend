const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
const HEADERS = {
  Accept: '*/*',
  Origin: 'https://player.videasy.to',
  Referer: 'https://player.videasy.to/',
  'User-Agent': UA,
}

async function probePlayer() {
  const urls = [
    'https://player.videasy.to/movie/27205',
    'https://videasy.net/',
    'https://player.videasy.net/movie/27205',
  ]
  for (const u of urls) {
    try {
      const r = await fetch(u, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        redirect: 'follow',
      })
      const t = await r.text()
      console.log('\n###', u, '->', r.status, r.url, 'len', t.length)
      const scripts = [...t.matchAll(/src=["']([^"']+)["']/g)]
        .map((m) => m[1])
        .filter((s) => /\.js/i.test(s))
        .slice(0, 25)
      console.log('scripts', scripts)
      const hits = [...t.matchAll(/https?:\/\/[^\s"'<>]+/g)]
        .map((m) => m[0])
        .filter((x) => /api|wings|speed|enc|stream|m3u8|videasy/i.test(x))
      console.log('urls', [...new Set(hits)].slice(0, 40))
      console.log(t.slice(0, 400).replace(/\s+/g, ' '))
    } catch (e) {
      console.log('fail', u, e.message)
    }
  }
}

async function tryDecFlow() {
  const title = 'Inception'
  const type = 'movie'
  const year = '2010'
  const imdb_id = 'tt1375666'
  const tmdb_id = '27205'
  const season = '1'
  const episode = '1'
  const enc_title = encodeURIComponent(encodeURIComponent(title))
  const bases = [
    'https://api.speedracelight.com',
    'https://api.wingsdatabase.com',
  ]
  const servers = ['cdn', 'jett', 'tejo', 'neon2', 'ym', 'downloader2', 'm4uhd', 'hdmovie', 'vsrc']

  for (const base of bases) {
    console.log('\n==== BASE', base)
    let seed
    try {
      const seedRes = await fetch(`${base}/seed?mediaId=${tmdb_id}`, { headers: HEADERS })
      const seedText = await seedRes.text()
      console.log('seed status', seedRes.status, seedText.slice(0, 300))
      seed = JSON.parse(seedText).seed
    } catch (e) {
      console.log('seed fail', e.message)
      continue
    }

    for (const server of servers) {
      const url =
        `${base}/${server}/sources-with-title?title=${enc_title}` +
        `&mediaType=${type}&year=${year}&episodeId=${episode}&seasonId=${season}` +
        `&tmdbId=${tmdb_id}&imdbId=${imdb_id}&enc=2&seed=${encodeURIComponent(seed)}`
      try {
        const r = await fetch(url, { headers: HEADERS })
        const text = await r.text()
        console.log(`\n[${server}]`, r.status, 'len', text.length, 'head', text.slice(0, 80))
        if (!r.ok || !text || text.length < 20) continue

        const dec = await fetch('https://enc-dec.app/api/dec-videasy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ text, id: tmdb_id, seed }),
        })
        const dj = await dec.json()
        console.log('dec status', dec.status, 'api', dj.status, 'keys', Object.keys(dj))
        const result = dj.result ?? dj
        const preview = typeof result === 'string' ? result.slice(0, 400) : JSON.stringify(result).slice(0, 600)
        console.log('dec preview', preview)
      } catch (e) {
        console.log(`[${server}] err`, e.message)
      }
    }
  }
}

await probePlayer()
await tryDecFlow()
