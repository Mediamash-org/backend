import fs from 'fs'

const loader = fs.readFileSync('tmp/filmo-voe-loader.a40897e.js', 'utf8')

// Find all string literals that look useful
const strs = [...loader.matchAll(/'([^'\\]|\\.){3,80}'/g)].map((m) => m[0].slice(1, -1))
const interesting = [...new Set(strs)].filter((s) =>
  /json|script|source|hls|file|url|decode|parse|atob|application|direct|access|m3u8|mp4|http/i.test(
    s,
  ),
)
console.log('interesting strings', interesting.slice(0, 80))

// Find the decode function near atob JSON.parse
const i = loader.indexOf("JSON['parse']")
console.log('\nJSON.parse contexts:')
let from = 0
for (let n = 0; n < 8; n++) {
  const j = loader.indexOf("JSON['parse']", from)
  if (j < 0) break
  console.log('---', j)
  console.log(loader.slice(j - 500, j + 200))
  from = j + 10
}

// Also search application
from = 0
for (let n = 0; n < 5; n++) {
  const j = loader.indexOf('application', from)
  if (j < 0) break
  console.log('\napp@', j, loader.slice(j - 80, j + 120))
  from = j + 10
}
