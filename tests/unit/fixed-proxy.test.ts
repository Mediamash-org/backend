import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { registerFixedProxy, rewriteManifest, sendFromPreHandler } from '../../src/proxy/fixed-proxy.js'

describe('sendFromPreHandler', () => {
  it('keeps preHandler pending so a competing route does not double-send', async () => {
    const app = Fastify({ logger: false })
    let routeHits = 0

    // Same shape as create-host: async-ish onSend delay (callback style with tick).
    app.addHook('onSend', (_request, _reply, payload, done) => {
      setImmediate(() => done(null, payload))
    })

    app.addHook('preHandler', async (request, reply) => {
      if (request.url.split('?')[0] !== '/v1/proxy') return
      reply.code(200).type('application/vnd.apple.mpegurl')
      await sendFromPreHandler(reply, Buffer.from('#EXTM3U\n'))
    })

    app.get('/v1/proxy', async (_request, reply) => {
      routeHits += 1
      return reply.code(200).send(Buffer.from('ROUTE_SHOULD_NOT_RUN'))
    })

    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/v1/proxy?data=%7B%7D' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('#EXTM3U')
    expect(res.body).not.toContain('ROUTE_SHOULD_NOT_RUN')
    expect(routeHits).toBe(0)
    await app.close()
  })
})

describe('registerFixedProxy', () => {
  it('serves a proxied manifest without invoking a competing /v1/proxy route', async () => {
    const upstreamBody = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000
index.m3u8
`
    const upstream = Fastify({ logger: false })
    upstream.get('/master.m3u8', async (_req, reply) => {
      return reply.type('application/vnd.apple.mpegurl').send(upstreamBody)
    })
    await upstream.listen({ port: 0, host: '127.0.0.1' })
    const address = upstream.server.address()
    if (!address || typeof address === 'string') throw new Error('expected TCP address')
    const upstreamUrl = `http://127.0.0.1:${address.port}/master.m3u8`

    const app = Fastify({ logger: false })
    let routeHits = 0
    app.addHook('onSend', (_request, _reply, payload, done) => {
      setImmediate(() => done(null, payload))
    })
    registerFixedProxy(app)
    app.get('/v1/proxy', async () => {
      routeHits += 1
      return 'ROUTE_SHOULD_NOT_RUN'
    })

    await app.ready()
    const data = encodeURIComponent(
      JSON.stringify({
        url: upstreamUrl,
        headers: { Referer: 'https://vidcore.org/' },
      }),
    )
    const res = await app.inject({ method: 'GET', url: `/v1/proxy?data=${data}` })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('/v1/proxy?data=')
    expect(res.body).toContain('index.m3u8')
    expect(routeHits).toBe(0)

    await app.close()
    await upstream.close()
  })
})

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
