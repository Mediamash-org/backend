const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const servers = ['london', 'frankfurt', 'dallas', 'singapore']

async function probe(url, label) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        Referer: 'https://vidcore.org/',
      },
      redirect: 'follow',
    })
    const ct = r.headers.get('content-type') || ''
    const buf = Buffer.from(await r.arrayBuffer())
    const head = buf.subarray(0, 160).toString('utf8')
    console.log(label, r.status, ct, 'bytes', buf.length, 'head', JSON.stringify(head.slice(0, 100)))
  } catch (e) {
    console.log(label, 'ERR', e.message)
  }
}

for (const s of servers) {
  const api = `https://movienig.ht/api/stream/v1/movie/27205?title=gg&year=1995&imdbId=gg&server=${s}`
  const r = await fetch(api, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  })
  const j = await r.json()
  console.log('\nSERVER', s, '->', j.server, 'sources', j.sources?.length, 'subs', j.subtitles?.length)
  if (j.sources?.[0]) await probe(j.sources[0].url, `  hls ${s}`)
}

const old = await (
  await fetch('https://streamguide.cfd/Perses/movie/27205?verify=true', {
    headers: { 'User-Agent': UA },
  })
).json()
console.log(
  '\nOLD providers',
  old.providers?.map((p) => `${p.name}:${p.sources?.length}`),
)
if (old.providers?.[0]?.sources?.[0]) {
  await probe(old.providers[0].sources[0].url, '  old mirror1')
}

const tv = await (
  await fetch(
    'https://movienig.ht/api/stream/v1/tv/1399/1/1?title=gg&year=1995&imdbId=gg&server=london',
    { headers: { 'User-Agent': UA, Accept: 'application/json' } },
  )
).json()
console.log('\nTV primary', tv.server, 'sources', tv.sources?.length)
if (tv.sources?.[0]) await probe(tv.sources[0].url, '  hls tv')
