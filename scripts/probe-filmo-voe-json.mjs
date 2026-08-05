import fs from 'fs'

const html = fs.readFileSync('tmp/filmo-voe2.html', 'utf8')
const apps = [
  ...html.matchAll(
    /<script[^>]*type=["']application\/(?:json|ld\+json)["'][^>]*>([\s\S]*?)<\/script>/gi,
  ),
]
console.log('application scripts', apps.length)
apps.forEach((m, i) => {
  console.log('---', i, 'len', m[1].length)
  console.log(m[1].slice(0, 300))
})

// also any type=application/*
const any = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
  .map((m) => ({ attrs: m[1], body: m[2] }))
  .filter((s) => /application\//i.test(s.attrs) || /type=/i.test(s.attrs))
console.log(
  'typed scripts',
  any.map((s) => s.attrs.trim().slice(0, 80) + ' body=' + s.body.length),
)

// Try decode packed like VOE: often shift-char decode then atob
const packed = fs.readFileSync('tmp/filmo-voe-packed.js', 'utf8').trim()
console.log('\npacked starts', packed.slice(0, 80))

// Attempt common VOE decode from loader pattern: charCode - n, then atob, JSON.parse
function shiftDecode(str, n) {
  return [...str].map((c) => String.fromCharCode(c.charCodeAt(0) - n)).join('')
}

// Extract string array from packed
let arr
try {
  arr = JSON.parse(packed)
} catch {
  // maybe it's just one string in array form without valid JSON due to truncation
  const m = packed.match(/\["([\s\S]*)"\]/)
  arr = m ? [m[1]] : null
}
console.log('arr?', Array.isArray(arr), arr?.length, typeof arr?.[0], arr?.[0]?.length)

if (arr?.[0]) {
  for (const n of [1, 2, 3, 5, 7, 13]) {
    try {
      const shifted = shiftDecode(arr[0], n)
      const b64 = shifted.match(/[A-Za-z0-9+/=]{40,}/)?.[0]
      console.log('shift', n, 'sample', shifted.slice(0, 80), 'b64?', !!b64)
      if (b64) {
        try {
          const json = Buffer.from(b64, 'base64').toString('utf8')
          console.log('  decoded', json.slice(0, 200))
        } catch {}
      }
    } catch (e) {
      console.log('shift', n, e.message)
    }
  }
}

// Look in loader for the exact decode pipeline around querySelectorAll application
const loader = fs.readFileSync('tmp/filmo-voe-loader.a40897e.js', 'utf8')
const i = loader.indexOf("querySelectorAll('script[type=")
console.log('\nqs context', loader.slice(i, i + 800))
const j = loader.indexOf('direct_access_url')
console.log('\ndirect context', loader.slice(j - 400, j + 200))
