import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

/** Map relative `./x.js` imports under src/ to `./x.ts` for Vitest only. */
function srcJsToTs(): Plugin {
  return {
    name: 'src-js-to-ts',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer || importer.includes(`${path.sep}node_modules${path.sep}`)) {
        return null
      }
      if (!source.startsWith('.') || !source.endsWith('.js')) {
        return null
      }
      if (!importer.replace(/\\/g, '/').includes('/src/')) {
        return null
      }

      const candidate = path.resolve(path.dirname(importer), source.replace(/\.js$/, '.ts'))
      if (fs.existsSync(candidate)) {
        return candidate
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [srcJsToTs()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    root,
    server: {
      deps: {
        inline: ['@omss-server/sample-provider-plugin'],
      },
    },
  },
})
