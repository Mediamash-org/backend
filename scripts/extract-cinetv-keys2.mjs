import fs from 'fs'

const dex = fs.readFileSync('tmp/cinetv-cs3/classes.dex')
let cur = ''
const out = []
for (const c of dex) {
  if (c >= 32 && c < 127) cur += String.fromCharCode(c)
  else {
    if (cur.length >= 4) out.push(cur)
    cur = ''
  }
}
if (cur.length >= 4) out.push(cur)

// Find BuildConfig related and nearby strings
const idx = out.findIndex((s) => s.includes('CINETV') || s === 'SECRET_KEY_ENCRYPTED')
console.log('idx', idx)
console.log(out.slice(Math.max(0, idx - 20), idx + 40).join('\n'))

console.log('\n=== base64-ish ===')
out
  .filter((s) => /^[A-Za-z0-9+/=]{16,120}$/.test(s) && /[+/=]/.test(s))
  .forEach((s) => console.log(s))

console.log('\n=== length 8-32 printable tokens ===')
out
  .filter((s) => /^[A-Za-z0-9_\-]{8,32}$/.test(s))
  .filter((s) => !/Lambda|Provider|CineTv|cloudstream|kotlin|jackson|android|Ljava|Lcom/i.test(s))
  .slice(0, 100)
  .forEach((s) => console.log(s))

// Look for strings near AES_KEY assignment in smali-like refs
for (const needle of ['AES_KEY', 'AES_IV', 'DES_KEY', 'DES_IV', 'WS_SECRET', 'SECRET_KEY']) {
  const i = out.indexOf(needle)
  console.log(`\nnear ${needle} @${i}`)
  if (i >= 0) console.log(out.slice(i - 5, i + 15).join(' | '))
}
