import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const files = readdirSync('tmp').filter((f) => f.startsWith('popcorn') && f.endsWith('.html'))
const report = {}

for (const file of files) {
  const html = readFileSync(`tmp/${file}`, 'utf8')
  const title = (html.match(/<title[^>]*>([^<]+)/i) || [])[1] || ''
  const iframe = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])
  const abs = [...html.matchAll(/https?:\/\/[^\s"'<>\\]+/g)].map((m) => m[0].replace(/&amp;/g, '&'))
  const hosts = {}
  for (const u of abs) {
    try {
      const h = new URL(u).host
      hosts[h] = (hosts[h] || 0) + 1
    } catch {
      /* ignore */
    }
  }
  const keywords = {}
  for (const k of [
    'vidsrc',
    '2embed',
    'embed.su',
    'autoembed',
    'm3u8',
    '/api/',
    'playlist',
    'stream',
    'player',
    'source',
    'xpass',
    'rabbit',
    'smashystream',
    'superembed',
    'multiembed',
    'videasy',
    'vidlink',
  ]) {
    const n = (html.toLowerCase().match(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || [])
      .length
    if (n) keywords[k] = n
  }
  const apiish = [
    ...html.matchAll(/["'`](\/(?:api|v1|stream|embed|player)[^"'`]{0,120})["'`]/g),
  ].map((m) => m[1])
  report[file] = {
    len: html.length,
    title,
    iframe: iframe.slice(0, 20),
    hosts: Object.entries(hosts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25),
    keywords,
    apiish: [...new Set(apiish)].slice(0, 50),
  }
}

writeFileSync('tmp/popcorn-page-report.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
