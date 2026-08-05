import fs from 'fs'

const dex = fs.readFileSync('tmp/pikashow-cs3/classes.dex')
const text = dex.toString('utf8')
const latin = dex.toString('latin1')

// Extract printable ASCII strings of length >= 8
function strings(buf) {
  const out = []
  let cur = ''
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i]
    if (c >= 32 && c < 127) cur += String.fromCharCode(c)
    else {
      if (cur.length >= 8) out.push(cur)
      cur = ''
    }
  }
  if (cur.length >= 8) out.push(cur)
  return out
}

const all = strings(dex)
fs.writeFileSync('tmp/pikashow-dex-strings.txt', all.join('\n'))
console.log('string count', all.length)

const interesting = all.filter((s) =>
  /api|hmac|secret|key|manoda|signature|pikashow|samui|loffe|tndb|m3u8|Bearer|Bearer/i.test(
    s,
  ),
)
console.log('\ninteresting:')
interesting.forEach((s) => console.log(s))

// Likely BuildConfig field values near PIKASHOW
const idx = all.findIndex((s) => /PIKASHOW/i.test(s))
console.log('\naround PIKASHOW idx', idx)
if (idx >= 0) console.log(all.slice(Math.max(0, idx - 5), idx + 15))

// hex-looking secrets
const hexish = all.filter((s) => /^[a-f0-9]{32,64}$/i.test(s) || /^[A-Za-z0-9_-]{20,80}$/.test(s))
console.log('\nhexish/tokenish', hexish.slice(0, 40))
