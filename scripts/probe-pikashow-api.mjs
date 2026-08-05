import crypto from 'crypto'

const UA =
  'Pikashow/2509030 (Android 13; Pixel 5; Channel/pikashow; gaid/test-gaid); Uuid/test-uuid'

function sign(apiKey, secret, ts = Math.floor(Date.now() / 1000)) {
  const timestamp = String(ts)
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${apiKey}:${timestamp}`)
    .digest('hex')
  return { timestamp, signature }
}

async function call(apiKey, secret, path = '/v1/api/videos?type=hollywood&channel=pikashow') {
  const { timestamp, signature } = sign(apiKey, secret)
  const r = await fetch(`https://manoda.co${path}`, {
    headers: {
      Host: 'manoda.co',
      'user-agent': UA,
      'X-API-Key': apiKey,
      'X-Signature': signature,
      'X-Timestamp': timestamp,
      Accept: 'application/json',
    },
  })
  const text = await r.text()
  console.log(
    `${apiKey.slice(0, 12)}…`,
    r.status,
    text.slice(0, 180).replace(/\s+/g, ' '),
  )
  return { status: r.status, text }
}

const bare = await fetch(
  'https://manoda.co/v1/api/videos?type=hollywood&channel=pikashow',
  { headers: { 'user-agent': UA, Accept: 'application/json' } },
)
console.log('noauth', bare.status, (await bare.text()).slice(0, 200).replace(/\s+/g, ' '))

for (const [k, s] of [
  ['pikashow', 'pikashow'],
  ['Pikashow', 'Pikashow'],
  ['api_key', 'hmac_secret'],
  ['manoda', 'manoda'],
  ['offshore', 'pikachu'],
]) {
  await call(k, s)
}

// Check env if user already set keys
const envKey = process.env.PIKASHOW_API_KEY
const envSecret = process.env.PIKASHOW_HMAC_SECRET
if (envKey && envSecret) {
  console.log('\nUsing env credentials')
  const res = await call(envKey, envSecret)
  if (res.status === 200) {
    const j = JSON.parse(res.text)
    console.log('records', j.records?.length, j.series?.length)
    console.log(JSON.stringify(j.records?.[0] || j.series?.[0], null, 2)?.slice(0, 500))
  }
} else {
  console.log('\nNo PIKASHOW_API_KEY / PIKASHOW_HMAC_SECRET in env')
}
