import { readFileSync, writeFileSync } from 'node:fs'

const t = readFileSync('tmp/bingr-Watch-_CRqr0Yz.js', 'utf8')
const idx = t.indexOf('${f}/stream')
console.log('CONTEXT AROUND STREAM:')
console.log(t.slice(idx - 1200, idx + 900))

// Find server maps near F[ and Quasar / s12
for (const k of ['Quasar', 's12', 'activeServer', 'srv:', 'servers', 'F=', 'const F', 'let F', 'var F']) {
  const i = t.indexOf(k, Math.max(0, idx - 5000))
  if (i > 0 && i < idx + 5000) {
    console.log(`\nNEAR ${k} @${i}`)
    console.log(t.slice(i, i + 400))
  }
}

writeFileSync('tmp/bingr-stream-context.txt', t.slice(idx - 2500, idx + 2500))
