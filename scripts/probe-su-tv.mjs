const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const headers = {
  'User-Agent': ua,
  Accept: 'text/html,application/json',
  Referer: 'https://streamingunity.vip/',
}

function parseDataPage(html) {
  const m = html.match(/data-page="([^"]+)"/)
  if (!m) throw new Error('no data-page')
  return JSON.parse(m[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
}

// Season page for Breaking Bad
const seasonHtml = await (
  await fetch('https://streamingunity.vip/en/titles/3-breaking-bad/season-1', { headers })
).text()
const seasonPage = parseDataPage(seasonHtml)
console.log('season component', seasonPage.component)
console.log('props keys', Object.keys(seasonPage.props))
const loaded = seasonPage.props.loadedSeason
console.log('loadedSeason keys', loaded && Object.keys(loaded))
console.log(
  'episodes sample',
  loaded?.episodes?.slice?.(0, 2).map((e) => ({
    id: e.id,
    number: e.number,
    name: e.name,
    scws_id: e.scws_id,
    tmdb_id: e.tmdb_id,
  })),
)

const ep = loaded?.episodes?.[0]
if (ep?.id) {
  // watch page with episode
  for (const url of [
    `https://streamingunity.vip/en/watch/${ep.id}`,
    `https://streamingunity.vip/en/iframe/${ep.id}`,
    `https://streamingunity.vip/en/watch/3?episode_id=${ep.id}`,
  ]) {
    const r = await fetch(url, { headers, redirect: 'follow' })
    const body = await r.text()
    const embed = body.match(/https:\/\/vixcloud\.co\/embed\/[^"&\s]+/)?.[0]?.replaceAll('&amp;', '&')
    let watchProps = null
    try {
      watchProps = parseDataPage(body)
    } catch {
      /* iframe html */
    }
    console.log('\n', url)
    console.log(' status', r.status, 'embed', embed?.slice(0, 120))
    if (watchProps?.props) {
      console.log(' component', watchProps.component)
      console.log(' title', watchProps.props.title?.id, watchProps.props.episode?.id, watchProps.props.episode?.scws_id)
      console.log(' embedUrl', watchProps.props.embedUrl)
    }
  }
}

// TMDB match via search: Inception 27205
const search = await (
  await fetch('https://streamingunity.vip/en/search?q=Inception', {
    headers: { ...headers, Accept: 'application/json' },
  })
).json()
console.log('\nsearch candidates', search.data?.slice(0, 5).map((x) => ({ id: x.id, name: x.name, type: x.type })))

// Confirm first result title page tmdb
const hit = search.data[0]
const titleHtml = await (
  await fetch(`https://streamingunity.vip/en/titles/${hit.id}-${hit.slug}`, { headers })
).text()
const title = parseDataPage(titleHtml).props.title
console.log('matched tmdb', title.tmdb_id, 'scws', title.scws_id)
