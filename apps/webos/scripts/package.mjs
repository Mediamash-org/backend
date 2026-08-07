import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const out = join(root, 'package')
const webos = join(root, 'webos')

if (!existsSync(dist)) {
  console.error('Missing dist/. Run npm run build first.')
  process.exit(1)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync(dist, out, { recursive: true })
cpSync(join(webos, 'appinfo.json'), join(out, 'appinfo.json'))

// Placeholder icons if none present
for (const name of ['icon.png', 'largeIcon.png']) {
  const src = join(webos, name)
  const dest = join(out, name)
  if (existsSync(src)) {
    cpSync(src, dest)
  } else {
    // Minimal 1x1 PNG so packaging tools don't fail hard
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    writeFileSync(dest, png)
  }
}

console.log(`webOS package staged at ${out}`)
console.log('Package with: ares-package package')
