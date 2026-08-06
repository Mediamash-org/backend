const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function main() {
  const html = await (
    await fetch('https://vidcore.org/embed/movie/27205', {
      headers: { 'User-Agent': UA, Accept: 'text/html', Referer: 'https://azmovies.to/' },
    })
  ).text()

  // Dump all interesting constants / fetch URLs from the inline script
  const needles = [
    'CORS_PROXY',
    'TMDB_KEY',
    'movienig',
    'streamguide',
    'vdrk',
    'providers',
    'fetch(',
    'sources',
    'quality',
    'file:',
    'url:',
    'm3u8',
    'getProviders',
    'loadServer',
    'loadStream',
    'async function',
  ]

  for (const n of needles) {
    let from = 0
    let count = 0
    while (count < 6) {
      const i = html.indexOf(n, from)
      if (i < 0) break
      console.log(`\n=== ${n} @${i}`)
      console.log(html.slice(Math.max(0, i - 200), i + 1200))
      from = i + n.length
      count++
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
