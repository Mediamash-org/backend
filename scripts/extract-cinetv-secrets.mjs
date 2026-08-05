import fs from 'fs'
import crypto from 'crypto'
import zlib from 'zlib'

fs.mkdirSync('tmp', { recursive: true })

function strings(buf) {
  const out = []
  let cur = ''
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i]
    if (c >= 32 && c < 127) cur += String.fromCharCode(c)
    else {
      if (cur.length >= 6) out.push(cur)
      cur = ''
    }
  }
  if (cur.length >= 6) out.push(cur)
  return out
}

async function downloadCs3() {
  const urls = [
    'https://raw.githubusercontent.com/NivinCNC/CNCVerse-Cloud-Stream-Extension/refs/heads/builds/CineTvProvider.cs3',
    'https://raw.githubusercontent.com/NivinCNC/CNCVerse-Cloud-Stream-Extension/builds/CineTvProvider.cs3',
  ]
  for (const u of urls) {
    try {
      const r = await fetch(u)
      if (!r.ok) continue
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 1000) {
        fs.writeFileSync('tmp/CineTvProvider.cs3', buf)
        console.log('downloaded', u, buf.length)
        return buf
      }
    } catch (e) {
      console.log('fail', u, e.message)
    }
  }
  throw new Error('Could not download CineTvProvider.cs3')
}

const buf = await downloadCs3()
// unzip via tar if zip
fs.writeFileSync('tmp/CineTvProvider.zip', buf)
fs.mkdirSync('tmp/cinetv-cs3', { recursive: true })

const all = strings(buf)
fs.writeFileSync('tmp/cinetv-cs3-strings.txt', all.join('\n'))
const interesting = all.filter((s) =>
  /CINETV|DES|AES|WS_SECRET|ajfysu|filmin|secret|encrypted|Zox882|wsSecret|AES_KEY|DES_KEY/i.test(
    s,
  ),
)
console.log('interesting count', interesting.length)
interesting.slice(0, 80).forEach((s) => console.log(s))
