import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const files = readdirSync('tmp').filter((f) => f.startsWith('su-') && f.endsWith('.html'))
const report = {}

for (const file of files) {
  const html = readFileSync(`tmp/${file}`, 'utf8')
  const pageMatch = html.match(/data-page="([^"]+)"/)
  let page = null
  if (pageMatch) {
    try {
      page = JSON.parse(pageMatch[1].replaceAll('&quot;', '"'))
    } catch {
      try {
        page = JSON.parse(
          pageMatch[1]
            .replaceAll('&quot;', '"')
            .replaceAll('&amp;', '&')
            .replaceAll('&#039;', "'"),
        )
      } catch (e) {
        page = { parseError: String(e) }
      }
    }
  }

  const iframes = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])
  const scripts = [...html.matchAll(/src=["']([^"']+)["']/gi)].map((m) => m[1])
  const urls = [...html.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0].replaceAll('&amp;', '&'))
  const interestingUrls = urls.filter((u) =>
    /vix|m3u8|playlist|embed|iframe|api|scws|stream/i.test(u),
  )

  report[file] = {
    len: html.length,
    title: (html.match(/<title[^>]*>([^<]+)/i) || [])[1],
    component: page?.component,
    scws: page?.props?.scws_url || page?.props?.cdn_url,
    propsKeys: page?.props ? Object.keys(page.props) : [],
    iframes: iframes.slice(0, 20),
    scripts: [...new Set(scripts)].filter((s) => s.includes('build/')).slice(0, 20),
    interestingUrls: [...new Set(interestingUrls)].slice(0, 40),
  }

  // Dump useful prop snippets
  if (page?.props) {
    const props = page.props
    report[file].auth = props.auth ? Object.keys(props.auth) : null
    report[file].titleProp = props.title
      ? {
          id: props.title.id,
          name: props.title.name,
          type: props.title.type,
          tmdb_id: props.title.tmdb_id ?? props.title.tmdbId,
          imdb_id: props.title.imdb_id ?? props.title.imdbId,
          slug: props.title.slug,
          seasons: props.title.seasons?.length,
        }
      : null
    report[file].streamProp = props.stream || props.iframe || props.embed || props.scws || null
    report[file].propNames = Object.keys(props)
  }
}

writeFileSync('tmp/su-pages-report.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
