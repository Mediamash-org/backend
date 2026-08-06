const BASE = 'https://02moviedownloader.site'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const tmdbId = Number(process.argv[2] || 27205)
const type = process.argv[3] || 'movie'
const season = Number(process.argv[4] || 1)
const episode = Number(process.argv[5] || 1)

const referer =
  type === 'movie'
    ? `${BASE}/api/download/movie/${tmdbId}`
    : `${BASE}/api/download/tv/${tmdbId}/${season}/${episode}`

const headers = {
  'User-Agent': UA,
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.7',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  dnt: '1',
  origin: BASE,
  referer,
  priority: 'u=1, i',
  'sec-ch-ua':
    '"Not A(Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'sec-gpc': '1',
}

const tokenRes = await fetch(`${BASE}/api/verify-robot`, {
  method: 'POST',
  headers,
})

console.log('token status', tokenRes.status, tokenRes.headers.get('content-type'))
const tokenText = await tokenRes.text()
console.log(tokenText.slice(0, 600))

let token = ''
try {
  token = JSON.parse(tokenText).token || ''
} catch {}

if (!token) process.exit(0)

const apiUrl =
  type === 'movie'
    ? `${BASE}/api/download/movie/${tmdbId}`
    : `${BASE}/api/download/tv/${tmdbId}/${season}/${episode}`

const apiRes = await fetch(apiUrl, {
  headers: {
    ...headers,
    accept: 'application/json',
    'x-session-token': token,
    referer,
  },
})

console.log('api status', apiRes.status, apiRes.headers.get('content-type'))
const apiText = await apiRes.text()
console.log(apiText.slice(0, 1000))
