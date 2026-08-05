import { readFileSync, writeFileSync } from 'node:fs'

function parseDataPage(html) {
  const m = html.match(/data-page="([^"]+)"/)
  if (!m) return null
  const raw = m[1]
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&#039;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
  return JSON.parse(raw)
}

const titleHtml = readFileSync('tmp/su-title-12824.html', 'utf8')
const watchHtml = readFileSync('tmp/su-watch-12824.html', 'utf8')
const homeHtml = readFileSync('tmp/su-home.html', 'utf8')
const iframeHtml = readFileSync('tmp/su-iframe-12824.html', 'utf8')

const titlePage = parseDataPage(titleHtml)
const watchPage = parseDataPage(watchHtml)
const homePage = parseDataPage(homeHtml)

const title = titlePage?.props?.title
console.log('TITLE KEYS', title && Object.keys(title))
console.log(
  'TITLE META',
  JSON.stringify(
    {
      id: title?.id,
      name: title?.name,
      type: title?.type,
      tmdb_id: title?.tmdb_id,
      imdb_id: title?.imdb_id,
      scws_id: title?.scws_id,
      seasons: title?.seasons?.map?.((s) => ({
        number: s.number ?? s.season_number,
        id: s.id,
      })),
    },
    null,
    2,
  ),
)

console.log('\nWATCH component', watchPage?.component)
console.log('WATCH props', watchPage?.props && Object.keys(watchPage.props))
console.log(
  'WATCH useful',
  JSON.stringify(
    {
      title: watchPage?.props?.title && {
        id: watchPage.props.title.id,
        name: watchPage.props.title.name,
        tmdb_id: watchPage.props.title.tmdb_id,
        scws_id: watchPage.props.title.scws_id,
      },
      episode: watchPage?.props?.episode,
      iframeUrl: watchPage?.props?.iframeUrl,
      embedUrl: watchPage?.props?.embedUrl,
      scws_url: watchPage?.props?.scws_url,
    },
    null,
    2,
  ),
)

console.log('\nIFRAME HTML', iframeHtml)

const ziggy = homePage?.props?.ziggy?.routes || {}
const apiRoutes = Object.entries(ziggy)
  .filter(([name, r]) => name.includes('api') || /search|title|watch|iframe|scws|stream/i.test(name + (r?.uri || '')))
  .map(([name, r]) => ({ name, uri: r.uri, methods: r.methods }))
console.log('\nAPI/WATCH ROUTES')
for (const r of apiRoutes) console.log(r.name, r.methods?.join(','), r.uri)

writeFileSync(
  'tmp/su-deep.json',
  JSON.stringify(
    {
      titleMeta: title,
      watchProps: watchPage?.props,
      apiRoutes,
      iframeHtml,
    },
    null,
    2,
  ),
)
