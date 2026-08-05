/**
 * Headful CF attempt - uses system Chrome if available.
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

mkdirSync('tmp', { recursive: true })

const network = []
let browser
try {
  browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  })
} catch {
  browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  })
}

const context = await browser.newContext({
  viewport: { width: 1360, height: 900 },
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
})
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
})
const page = await context.newPage()
page.on('response', async (resp) => {
  const url = resp.url()
  if (!/api\/|m3u8|embed|stream|playlist|subtitle/i.test(url)) return
  let bodyPreview = ''
  try {
    if (/api\/sources|api\/subtitles|m3u8/i.test(url)) {
      bodyPreview = (await resp.text()).slice(0, 500)
    }
  } catch {
    /* ignore */
  }
  network.push({
    status: resp.status(),
    url: url.slice(0, 400),
    ctype: resp.headers()['content-type'] || '',
    bodyPreview,
  })
})

console.log('goto home...')
await page.goto('https://popcornmovies.io/', { waitUntil: 'domcontentloaded', timeout: 120000 })
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000)
  const title = await page.title()
  console.log(`t=${(i + 1) * 5}s title=${title}`)
  if (!title.includes('Just a moment')) break
}

const title = await page.title()
const challenged = title.includes('Just a moment')
console.log('final title', title, 'challenged', challenged)

if (!challenged) {
  console.log('goto watch inception 27205')
  await page.goto('https://popcornmovies.io/watch/movie/27205', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  })
  await page.waitForTimeout(20000)
  console.log('watch title', await page.title())
}

writeFileSync(
  'tmp/popcorn-headful.json',
  JSON.stringify(
    {
      title,
      challenged,
      url: page.url(),
      network,
      cookies: await context.cookies(),
    },
    null,
    2,
  ),
)
console.log('network hits', network.length)
await browser.close()
