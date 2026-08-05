import { readFileSync, writeFileSync } from 'node:fs'

function parseDataPage(html) {
  const m = html.match(/data-page="([^"]+)"/)
  if (!m) return null
  return JSON.parse(
    m[1]
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&')
      .replaceAll('&#039;', "'"),
  )
}

const home = parseDataPage(readFileSync('tmp/su-home.html', 'utf8'))
const routes = home?.props?.ziggy?.routes || {}
const list = Object.entries(routes).map(([name, r]) => ({
  name,
  uri: r.uri,
  methods: r.methods,
}))
list.sort((a, b) => a.name.localeCompare(b.name))
writeFileSync('tmp/su-ziggy.json', JSON.stringify(list, null, 2))
for (const r of list) {
  if (/api|search|preview|title|watch|iframe|archive|movie|tv/i.test(r.name + r.uri)) {
    console.log(`${r.name}\t${(r.methods || []).join(',')}\t${r.uri}`)
  }
}
