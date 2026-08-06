const base = 'https://xmovies8.to'
const path = process.argv[2] || '/'

const html = await fetch(new URL(path, base), {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
}).then((r) => r.text())

console.log('URL', new URL(path, base).href)
console.log('--- title ---')
console.log((html.match(/<title>([^<]+)</i)?.[1] || '').trim())

console.log('--- href sample ---')
const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map((m) => m[1])
for (const href of hrefs.slice(0, 120)) console.log(href)

console.log('--- movie/tv links ---')
const mediaLinks = hrefs.filter((href) => /\/(movie|tv)\/[^/]+-\d+\/?$/i.test(href))
for (const href of [...new Set(mediaLinks)].slice(0, 80)) console.log(href)

console.log('--- data hints ---')
for (const needle of [
  '/search',
  '/movie/',
  '/tv/',
  '/watch-',
  'ajax',
  'episode',
  'season',
  'iframe',
  'embed',
  'player',
  'sources',
  'download',
]) {
  const i = html.toLowerCase().indexOf(needle.toLowerCase())
  if (i >= 0) {
    console.log(`needle=${needle} at ${i}`)
    console.log(html.slice(Math.max(0, i - 180), i + 800))
  }
}
