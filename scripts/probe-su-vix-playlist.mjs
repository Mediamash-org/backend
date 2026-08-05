const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const token = '68eca000ed1ac71a87350e8a05295e4d'
const expires = '1791148433'
const masterUrl = 'https://vixcloud.co/playlist/231752?b=1'
const streams = [
  { name: 'Server1', url: 'https://vixcloud.co/playlist/231752?b=1&ub=1' },
  { name: 'Server2', url: 'https://vixcloud.co/playlist/231752?b=1&ab=1' },
]

async function tryUrl(label, url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': ua,
      Accept: '*/*',
      Referer: 'https://vixcloud.co/',
      Origin: 'https://vixcloud.co',
    },
  })
  const t = await r.text()
  console.log(
    `\n${label}\n`,
    r.status,
    r.headers.get('content-type'),
    t.slice(0, 280).replace(/\s+/g, ' | '),
  )
}

const withAuth = (base) => {
  const u = new URL(base)
  u.searchParams.set('token', token)
  u.searchParams.set('expires', expires)
  return u.toString()
}

await tryUrl('master+auth', withAuth(masterUrl))
await tryUrl('server2+auth', withAuth(streams[1].url))
await tryUrl('master raw', masterUrl)

// TV episode path check - Breaking Bad
const search = await (
  await fetch('https://streamingunity.vip/en/search?q=Breaking%20Bad', {
    headers: { 'User-Agent': ua, Accept: 'application/json', Referer: 'https://streamingunity.vip/' },
  })
).json()
const show = search.data?.find((x) => x.type === 'tv' && /breaking bad/i.test(x.name))
console.log('\nTV search', show && { id: show.id, slug: show.slug, type: show.type })

if (show) {
  const html = await (
    await fetch(`https://streamingunity.vip/en/titles/${show.id}-${show.slug}`, {
      headers: { 'User-Agent': ua, Accept: 'text/html', Referer: 'https://streamingunity.vip/' },
    })
  ).text()
  const page = JSON.parse(
    html.match(/data-page="([^"]+)"/)[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
  )
  const title = page.props.title
  console.log('TV meta', {
    id: title.id,
    tmdb_id: title.tmdb_id,
    scws_id: title.scws_id,
    seasons_count: title.seasons_count,
    season1eps: title.seasons?.[0]?.episodes?.length ?? title.loadedSeason,
  })
  console.log('season0 keys', title.seasons?.[0] && Object.keys(title.seasons[0]))
  const ep = title.seasons?.[0]?.episodes?.[0]
  console.log('ep0', ep && { id: ep.id, number: ep.number ?? ep.episode_number, scws_id: ep.scws_id })

  // Try iframe with episode id if present
  if (ep?.id) {
    for (const path of [
      `https://streamingunity.vip/en/iframe/${ep.id}`,
      `https://streamingunity.vip/en/iframe/${show.id}?episode_id=${ep.id}`,
      `https://streamingunity.vip/en/watch/${show.id}?episode_id=${ep.id}`,
    ]) {
      const r = await fetch(path, {
        headers: { 'User-Agent': ua, Accept: 'text/html', Referer: 'https://streamingunity.vip/' },
        redirect: 'manual',
      })
      const body = await r.text()
      const embed = body.match(/vixcloud\.co\/embed\/[^"&\s]+/)?.[0]
      console.log('try', path.slice(30), r.status, embed || body.slice(0, 120).replace(/\s+/g, ' '))
    }
  }
}
