import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaseProvider } from '@omss/framework'
import type { ProviderMediaObject } from '@omss/framework'
import { createOmssProviders } from '../../plugins/bingr-provider/src/index.ts'

describe('Bingr provider plugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exports createOmssProviders with BaseProvider', () => {
    const [provider] = createOmssProviders({ id: 'bingr-test' })
    expect(provider).toBeInstanceOf(BaseProvider)
    expect(provider.id).toBe('bingr-test')
  })

  it('maps stream API sources to proxied HLS with headers', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/details/movie/27205')) {
          return Response.json({ id: 27205, title: 'Inception', year: '2010', type: 'movie' })
        }
        if (url.endsWith('/stream') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { srv: string }
          if (body.srv === 's11') {
            return Response.json({
              scraperName: 'Sirius',
              sources: [
                {
                  url: 'https://cdn.example/stream.m3u8',
                  quality: '1080p',
                  language: 'English',
                  type: 'application/x-mpegurl',
                  headers: { Referer: 'https://hdghartv.cc/' },
                },
              ],
              subtitles: [
                {
                  url: 'https://cdn.example/en.vtt',
                  label: 'English',
                  lang: 'en',
                },
              ],
            })
          }
          return Response.json({ scraperName: body.srv, sources: [], subtitles: [] })
        }
        if (url.includes('/subtitles/vdrk/movie/27205')) {
          return Response.json({
            subtitles: [
              {
                url: 'https://cache.vdrk.site/v1/vtt/movie/27205/English.vtt',
                lang: 'en',
                label: 'English',
              },
            ],
          })
        }
        return new Response('fail', { status: 502 })
      }),
    )

    const [provider] = createOmssProviders({
      timeoutMs: 5000,
      servers: ['s11', 's30'],
      fetchVdrkSubs: true,
    })
    const media: ProviderMediaObject = {
      type: 'movie',
      tmdbId: '27205',
      title: 'Inception',
      releaseYear: '2010',
    }

    const result = await provider.getMovieSources(media)
    expect(result.sources.length).toBe(1)
    expect(result.sources[0].type).toBe('hls')
    expect(result.sources[0].quality).toBe('1080p')
    expect(result.sources[0].url).toContain('/v1/proxy?data=')
    expect(result.sources[0].provider?.name).toBe('Bingr/Sirius')
    expect(result.subtitles.length).toBeGreaterThanOrEqual(1)

    const proxyPayload = JSON.parse(
      decodeURIComponent(result.sources[0].url.split('data=')[1]!),
    ) as { url: string; headers: Record<string, string> }
    expect(proxyPayload.url).toBe('https://cdn.example/stream.m3u8')
    expect(proxyPayload.headers.Referer).toBe('https://hdghartv.cc/')
  })

  it('returns diagnostics when all servers fail', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/details/')) {
          return Response.json({ title: 'Inception', year: '2010' })
        }
        if (url.endsWith('/stream') && init?.method === 'POST') {
          return Response.json({ error: 'stream lookup failed' }, { status: 500 })
        }
        if (url.includes('/subtitles/vdrk/')) {
          return Response.json({ subtitles: [] })
        }
        return new Response('fail', { status: 502 })
      }),
    )

    const [provider] = createOmssProviders({
      timeoutMs: 5000,
      servers: ['s1'],
      fetchVdrkSubs: false,
    })
    const result = await provider.getMovieSources({
      type: 'movie',
      tmdbId: '27205',
      title: 'Inception',
      releaseYear: '2010',
    })
    expect(result.sources).toEqual([])
    expect(result.diagnostics?.length).toBeGreaterThan(0)
  })
})
