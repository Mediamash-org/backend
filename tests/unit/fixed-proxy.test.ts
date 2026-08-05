import { describe, expect, it } from 'vitest'
import { rewriteManifest } from '../../src/proxy/fixed-proxy.js'

describe('rewriteManifest', () => {
  it('rewrites relative HLS variant URIs through /v1/proxy', () => {
    const base = 'https://tik.1x2.space/playlist/abc/master.m3u8'
    const input = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1994895,RESOLUTION=1920x800
index-f1-v1-a1.m3u8?v=
`
    const out = rewriteManifest(input, base, { Referer: 'https://example.com/' }, 'http://localhost:3000')
    expect(out).toContain('http://localhost:3000/v1/proxy?data=')
    expect(out).not.toContain('\nindex-f1-v1-a1.m3u8')

    const dataLine = out
      .split('\n')
      .find((line) => line.includes('/v1/proxy?data='))!
    const encoded = dataLine.split('data=')[1]
    const payload = JSON.parse(decodeURIComponent(encoded)) as {
      url: string
      headers: Record<string, string>
    }
    expect(payload.url).toBe('https://tik.1x2.space/playlist/abc/index-f1-v1-a1.m3u8?v=')
    expect(payload.headers.Referer).toBe('https://example.com/')
  })

  it('rewrites URI= attributes on tags', () => {
    const base = 'https://cdn.example/a/master.m3u8'
    const input = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
`
    const out = rewriteManifest(input, base, undefined, 'http://localhost:3000')
    expect(out).toMatch(/URI="http:\/\/localhost:3000\/v1\/proxy\?data=/)
    const match = out.match(/URI="([^"]+)"/)!
    const payload = JSON.parse(decodeURIComponent(match[1].split('data=')[1])) as { url: string }
    expect(payload.url).toBe('https://cdn.example/a/key.bin')
  })
})
