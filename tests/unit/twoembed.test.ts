import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaseProvider } from '@omss/framework'
import type { ProviderMediaObject } from '@omss/framework'
import { createOmssProviders } from '../../plugins/twoembed-provider/src/index.ts'

describe('2Embed provider plugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exports createOmssProviders with BaseProvider', () => {
    const [provider] = createOmssProviders({ id: '2embed-test' })
    expect(provider).toBeInstanceOf(BaseProvider)
    expect(provider.id).toBe('2embed-test')
  })

  it('maps xpass playlist sources to proxied HLS', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/e/movie/tt1375666')) {
          return new Response(
            `<html><script>
var data={"playlist":"\/mdata\/abc\/1\/playlist.json","tracks":[],"autostart":false};
var suburl="https://sub.1x2.space/api/movie/27205";
</script></html>`,
            { status: 200 },
          )
        }
        if (url.includes('/mdata/abc/1/playlist.json')) {
          return Response.json({
            playlist: [
              {
                sources: [
                  { file: 'https://cdn.example/stream.m3u8', type: 'hls', label: '1080p' },
                ],
              },
            ],
          })
        }
        if (url.includes('sub.1x2.space/api/movie/27205')) {
          return Response.json([{ url: '/subtitle/movie/27205/English.vtt', label: 'English' }])
        }
        return new Response('fail', { status: 502 })
      }),
    )

    const [provider] = createOmssProviders({ timeoutMs: 5000 })
    const media: ProviderMediaObject = {
      type: 'movie',
      tmdbId: '27205',
      title: 'Inception',
      releaseYear: '2010',
      imdbId: 'tt1375666',
    }

    const result = await provider.getMovieSources(media)
    expect(result.sources.length).toBe(1)
    expect(result.sources[0].type).toBe('hls')
    expect(result.sources[0].url).toContain('/v1/proxy?data=')
    expect(result.sources[0].quality).toBe('1080p')
    expect(result.subtitles.length).toBe(1)
  })

  it('returns a diagnostic when playlist has no usable sources', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/e/movie/tt1375666')) {
          return new Response(`var data={"playlist":"/mdata/empty/1/playlist.json","tracks":[]};`, {
            status: 200,
          })
        }
        if (url.includes('/mdata/empty/1/playlist.json')) {
          return Response.json({ playlist: [{ sources: [] }] })
        }
        return new Response('fail', { status: 502 })
      }),
    )

    const [provider] = createOmssProviders()
    const result = await provider.getMovieSources({
      type: 'movie',
      tmdbId: '27205',
      title: 'Inception',
      releaseYear: '2010',
      imdbId: 'tt1375666',
    })

    expect(result.sources).toHaveLength(0)
    expect(result.diagnostics[0]?.message).toMatch(/playlist json contained no sources/i)
  })

  it('builds TV stream page URLs', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://play.xpass.top/e/tv/tt0944947/1/1') {
        return new Response(`var data={"playlist":"/mdata/ep/1/playlist.json","tracks":[]};`, {
          status: 200,
        })
      }
      if (url.includes('/mdata/ep/1/playlist.json')) {
        return Response.json({
          playlist: [{ sources: [{ file: 'https://cdn.example/ep.m3u8', type: 'hls' }] }],
        })
      }
      if (url.includes('sub.1x2.space')) {
        return Response.json([])
      }
      return new Response('fail', { status: 502 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const [provider] = createOmssProviders()
    const result = await provider.getTVSources({
      type: 'tv',
      tmdbId: '1399',
      title: 'Game of Thrones',
      releaseYear: '2011',
      imdbId: 'tt0944947',
      s: 1,
      e: 1,
    })
    expect(result.sources.length).toBe(1)
    expect(fetchMock).toHaveBeenCalled()
  })
})
