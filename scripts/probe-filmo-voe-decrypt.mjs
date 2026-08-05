import fs from 'fs'

function rot13(input) {
  return input.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function replacePatterns(input) {
  const patterns = ['@$', '^^', '~@', '%?', '*~', '!!', '#&']
  let out = input
  for (const p of patterns) out = out.split(p).join('_')
  return out
}

function removeUnderscores(input) {
  return input.replace(/_/g, '')
}

function charShift(input, shift) {
  return [...input].map((c) => String.fromCharCode(c.charCodeAt(0) - shift)).join('')
}

function decryptF7(p8) {
  const vF = rot13(p8)
  const vF2 = replacePatterns(vF)
  const vF3 = removeUnderscores(vF2)
  const vF4 = Buffer.from(vF3, 'base64').toString('utf8')
  const vF5 = charShift(vF4, 3)
  const vF6 = vF5.split('').reverse().join('')
  const vAtob = Buffer.from(vF6, 'base64').toString('utf8')
  return JSON.parse(vAtob)
}

const packed = JSON.parse(fs.readFileSync('tmp/filmo-voe-packed.js', 'utf8'))[0]
const data = decryptF7(packed)
console.log(JSON.stringify(data, null, 2).slice(0, 1500))
console.log('source', data.source)
console.log('direct', data.direct_access_url || data.directAccessUrl)
