import crypto from 'crypto'
import zlib from 'zlib'
import fs from 'fs'

function des3Decrypt(encryptedText, desKey, desIv) {
  const key = Buffer.from(desKey, 'utf8')
  const key24 = Buffer.alloc(24)
  key.copy(key24, 0, 0, Math.min(key.length, 24))
  const iv = Buffer.from(desIv, 'utf8')
  const decipher = crypto.createDecipheriv('des-ede3-cbc', key24, iv)
  const encrypted = Buffer.from(encryptedText, 'base64')
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

function aesDecrypt(encryptedBase64, aesKey, aesIv) {
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    Buffer.from(aesKey, 'utf8'),
    Buffer.from(aesIv, 'utf8'),
  )
  const encrypted = Buffer.from(encryptedBase64, 'base64')
  let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  if (decrypted[0] === 0x1f && decrypted[1] === 0x8b) {
    decrypted = zlib.gunzipSync(decrypted)
  }
  return decrypted.toString('utf8')
}

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex')
}

function generateSign(secretPlain, deviceId, curTime) {
  return md5(secretPlain + deviceId + curTime).toUpperCase()
}

const candidates = {
  encrypted: [
    'MxASAkl/yHTGg+/Tw1R7u96nGqkWsOZ2',
    ' MxASAkl/yHTGg+/Tw1R7u96nGqkWsOZ2'.trim(),
  ],
  desKeys: [
    '012345678912345678901234', // 24
    '201503012012345620150301',
    '123456789012345678901234',
    'abcdefghijklmnopabcdefgh',
  ],
  desIvs: ['32456738', '12345678', '01234567', '20150301'],
  aesKeys: ['0123456789123456', '2015030120123456'],
  aesIvs: ['2015030120123456', '0123456789123456'],
}

console.log('=== try DES3 decrypt encrypted secret ===')
for (const enc of candidates.encrypted) {
  for (const dk of candidates.desKeys) {
    for (const di of candidates.desIvs) {
      try {
        const plain = des3Decrypt(enc, dk, di)
        if (/^[\x20-\x7e]+$/.test(plain) && plain.length > 4) {
          console.log('OK', { enc: enc.slice(0, 20), dk, di, plain })
        }
      } catch {}
    }
  }
}

// Also extract all base64-looking from dex more carefully
const dex = fs.readFileSync('tmp/cinetv-cs3/classes.dex')
let cur = ''
const out = []
for (const c of dex) {
  if (c >= 32 && c < 127) cur += String.fromCharCode(c)
  else {
    if (cur.length >= 8) out.push(cur)
    cur = ''
  }
}
const b64 = out.filter((s) => /^[A-Za-z0-9+/]+=*$/.test(s) && s.length >= 20 && s.length <= 80)
console.log('\nbase64 candidates', b64)

// Try common cinema app keys from similar apps
const known = [
  { enc: 'MxASAkl/yHTGg+/Tw1R7u96nGqkWsOZ2', desKey: '2015030120123456abcd1234', desIv: '32456738' },
  { enc: 'MxASAkl/yHTGg+/Tw1R7u96nGqkWsOZ2', desKey: '0123456789abcdeffedcba98', desIv: '32456738' },
]
