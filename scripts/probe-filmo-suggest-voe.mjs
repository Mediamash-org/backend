import fs from 'fs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const home = fs.readFileSync('tmp/filmo-home.html', 'utf8')
const suggestUrl = home.match(/data-suggest-url="([^"]+)"/)?.[1]
const searchUrl = home.match(/data-search-url="([^"]+)"/)?.[1]
console.log('suggestUrl', suggestUrl)
console.log('searchUrl', searchUrl)
const navSearch = home.match(/nav-search-modal[\s\S]{0,800}/)?.[0]
console.log('nav', navSearch?.replace(/\s+/g, ' ')?.slice(0, 500))

async function get(url, headers = {}) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json, text/html,*/*', ...headers },
  })
  return { status: r.status, ct: r.headers.get('content-type'), text: await r.text(), url: r.url }
}

if (suggestUrl) {
  const u = suggestUrl.includes('%QUERY%')
    ? suggestUrl.replace('%QUERY%', encodeURIComponent('Inception'))
    : `${suggestUrl}${suggestUrl.includes('?') ? '&' : '?'}q=Inception`
  const r = await get(u, {
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
    Referer: 'https://filmo.to/',
  })
  console.log('suggest', r.status, r.ct, r.text.slice(0, 800))
  fs.writeFileSync('tmp/filmo-suggest.json', r.text)
}

// also try common patterns
for (const u of [
  'https://filmo.to/search/suggest?q=Inception',
  'https://filmo.to/search/suggest?query=Inception',
  'https://filmo.to/suggest?q=Inception',
  'https://filmo.to/movies/suggest?q=Inception',
]) {
  const r = await get(u, {
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
    Referer: 'https://filmo.to/',
  })
  console.log(u, r.status, r.text.slice(0, 200).replace(/\s+/g, ' '))
}

// VOE deeper - look for sources in large script
const voe = fs.readFileSync('tmp/filmo-voe.html', 'utf8')
fs.writeFileSync('tmp/filmo-voe-url.txt', '')
const big = [...voe.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
const bigScript = big.sort((a, b) => b.length - a.length)[0]
fs.writeFileSync('tmp/filmo-voe-big.js', bigScript)
console.log('\nbig script len', bigScript.length)
for (const pat of [
  'm3u8',
  'mp4',
  'sources',
  'hls',
  'jwplayer',
  'atob',
  'fromCharCode',
  'decode',
  'source',
  'file',
  'cdn',
  'delivery',
]) {
  console.log(pat, (bigScript.match(new RegExp(pat, 'gi')) || []).length)
}
// extract string literals containing http
const httpStrs = [...bigScript.matchAll(/["'`](https?:[^"'`]+)["'`]/g)].map((m) => m[1])
console.log('http strs', [...new Set(httpStrs)].slice(0, 40))
// look near jwplayer setup
const jw = bigScript.indexOf('jwplayer')
console.log('jw context', bigScript.slice(jw, jw + 500))
const srcIdx = bigScript.search(/sources\s*[:=]/)
console.log('sources idx', srcIdx, bigScript.slice(srcIdx, srcIdx + 400))

// Also check access page pattern - maybe need POST
console.log('\naccess url from previous run was encrypted')
const accessMatch = voe.match(/https?:\/\/[^"'\\\s]+access[^"'\\\s]*/)?.[0]
console.log('access in page?', accessMatch)
