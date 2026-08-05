/**
 * Probe popcornmovies.io behind Cloudflare using Playwright.
 * Run: npx --yes -p playwright@1.49.1 node scripts/probe-popcornmovies.mjs
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'tmp', 'popcornmovies-probe.json')

const CANDIDATES = [
  'https://popcornmovies.io/movie/27205',
  'https://popcornmovies.io/movies/27205',
  'https://popcornmovies.io/watch/movie/27205',
  'https://popcornmovies.io/watch/27205',
  'https://popcornmovies.io/film/27205',
  'https://popcornmovies.io/title/27205',
  'https://popcornmovies.io/movie/inception',
  'https://popcornmovies.io/movies/inception-2010',
]

function interesting(url) {
  const u = url.toLowerCase()
  return [
    'm3u8',
    'mp4',
    'playlist',
    'embed',
    'stream',
    'vidsrc',
    '2embed',
    'proxy',
    '/api/',
    'tmdb',
    'subtitle',
    'vtt',
    'player',
    'source',
    'hls',
  ].some((k) => u.includes(k))
}

const result = {
  home: {},
  routes: [],
  network: [],
  iframes: [],
  page_links: [],
  notes: [],
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  viewport: { width: 1365, height: 900 },
  locale: 'en-US',
})
const page = await context.newPage()

page.on('response', async (resp) => {
  try {
    const url = resp.url()
    const type = resp.request().resourceType()
    if (!interesting(url) && !['xhr', 'fetch', 'document', 'media'].includes(type)) return
    if (interesting(url) || type === 'xhr' || type === 'fetch' || type === 'media') {
      result.network.push({
        status: resp.status(),
        type,
        method: resp.request().method(),
        url: url.slice(0, 500),
        ctype: (resp.headers()['content-type'] || '').slice(0, 80),
      })
    }
  } catch (e) {
    result.notes.push(`response hook: ${e.message}`)
  }
})

console.log('>> home')
await page.goto('https://popcornmovies.io/', { waitUntil: 'domcontentloaded', timeout: 90_000 })
await page.waitForTimeout(8000)
let title = await page.title()
let html = await page.content()
let challenged = title.includes('Just a moment') || html.includes('challenge-platform')
result.home = {
  url: page.url(),
  title,
  challenged,
  html_len: html.length,
  snippet: html.replace(/\s+/g, ' ').slice(0, 400),
}
console.log(`   title=${title} challenged=${challenged}`)

if (challenged) {
  console.log('>> waiting for CF...')
  try {
    await page.waitForFunction(() => !document.title.includes('Just a moment'), {
      timeout: 60_000,
    })
    await page.waitForTimeout(4000)
    result.home.after_challenge = { title: await page.title(), url: page.url() }
    console.log(`   cleared -> ${result.home.after_challenge.title}`)
  } catch (e) {
    result.notes.push(`CF wait failed: ${e.message}`)
    console.log(`   CF wait failed: ${e.message}`)
  }
}

try {
  result.page_links = await page.$$eval('a[href]', (els) =>
    els.map((e) => e.getAttribute('href')).filter(Boolean).slice(0, 100),
  )
  console.log(`   links=${result.page_links.length}`)
} catch (e) {
  result.notes.push(`links: ${e.message}`)
}

for (const url of CANDIDATES) {
  console.log(`>> try ${url}`)
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(4000)
    const frames = page.frames().map((f) => f.url()).filter((u) => u && u !== page.url())
    const entry = {
      url,
      final: page.url(),
      status: resp?.status() ?? null,
      title: await page.title(),
      iframes: frames.slice(0, 20),
      challenged: (await page.title()).includes('Just a moment'),
    }
    result.routes.push(entry)
    result.iframes.push(...frames)
    console.log(`   status=${entry.status} title=${entry.title} frames=${frames.length}`)

    if (!entry.challenged && entry.status && entry.status < 400) {
      for (const sel of ["button:has-text('Play')", "button:has-text('Watch')", '[class*="play"]']) {
        try {
          const loc = page.locator(sel).first
          if ((await loc.count()) > 0 && (await loc.isVisible())) {
            await loc.click({ timeout: 2000 })
            await page.waitForTimeout(4000)
            break
          }
        } catch {
          /* ignore */
        }
      }
      break
    }
  } catch (e) {
    result.routes.push({ url, error: e.message })
    console.log(`   error: ${e.message}`)
  }
}

const seen = new Set()
result.network = result.network
  .filter((n) => {
    const key = `${n.method}|${n.status}|${n.url}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  .slice(0, 200)
result.iframes = [...new Set(result.iframes)].slice(0, 50)

await browser.close()
await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(result, null, 2))
console.log(`\nWrote ${OUT}`)
console.log(`network=${result.network.length} routes=${result.routes.length}`)
