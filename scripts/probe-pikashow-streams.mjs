import fs from 'fs'

const UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

async function get(url, headers = {}) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
      redirect: 'follow',
    })
    const text = await r.text()
    return { status: r.status, url: r.url, ct: r.headers.get('content-type'), text }
  } catch (e) {
    return { status: 0, url, ct: '', text: String(e) }
  }
}

const inception = JSON.parse(fs.readFileSync('tmp/pikashow-inception-list.json', 'utf8'))

for (const cu of inception.clientUrls || []) {
  console.log('\n===', cu.label, cu.url)
  const r = await get(cu.url, {
    Referer: 'https://samui390dod.com/',
    Origin: 'https://samui390dod.com',
  })
  console.log(r.status, r.ct, r.url.slice(0, 120))
  console.log(r.text.slice(0, 300).replace(/\s+/g, ' '))
  if (/#EXTM3U|m3u8|mp4|HDVBPlayer/i.test(r.text)) {
    fs.writeFileSync(`tmp/pikashow-${cu.label}.txt`, r.text)
  }
}
