const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const headers = {
  'User-Agent': ua,
  Accept: 'text/html,*/*',
  Referer: 'https://streamingunity.vip/',
}

const iframeHtml = await (
  await fetch('https://streamingunity.vip/en/iframe/3?episode_id=1', { headers })
).text()
const embed = iframeHtml
  .match(/src="(https:\/\/vixcloud\.co\/embed\/[^"]+)"/)?.[1]
  ?.replaceAll('&amp;', '&')
console.log('tv embed', embed)

const embedHtml = await (
  await fetch(embed, {
    headers: { ...headers, Referer: 'https://streamingunity.vip/', Origin: 'https://streamingunity.vip' },
  })
).text()
const token = embedHtml.match(/['"]token['"]\s*:\s*['"]([^'"]+)['"]/)?.[1]
const expires = embedHtml.match(/['"]expires['"]\s*:\s*['"]([^'"]+)['"]/)?.[1]
const masterUrl = embedHtml.match(/url:\s*['"](https:\/\/vixcloud\.co\/playlist\/[^'"]+)['"]/)?.[1]
console.log({ token, expires, masterUrl })

const playlistUrl = new URL(masterUrl)
playlistUrl.searchParams.set('token', token)
playlistUrl.searchParams.set('expires', expires)
const pl = await fetch(playlistUrl, {
  headers: {
    'User-Agent': ua,
    Referer: 'https://vixcloud.co/',
    Origin: 'https://vixcloud.co',
  },
})
const body = await pl.text()
console.log('playlist', pl.status, body.slice(0, 220).replace(/\s+/g, ' | '))
