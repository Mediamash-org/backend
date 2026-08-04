import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOmssProviders } from '../../plugins/netmirror-provider/src/index.ts'
import type { ProviderMediaObject } from '@omss/framework'
import { BaseProvider } from '@omss/framework'

describe('NetMirror provider plugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exports createOmssProviders with BaseProvider instance', () => {
    const [provider] = createOmssProviders({ id: 'netmirror-test' })
    expect(provider).toBeInstanceOf(BaseProvider)
    expect(provider.id).toBe('netmirror-test')
    expect(provider.capabilities.supportedContentTypes).toContain('movies')
    expect(provider.capabilities.supportedContentTypes).toContain('tv')
  })

  it('resolves movie streams from variants + embed APIs', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes('/api/variants-tmdb/movie/155')) {
          return Response.json({
            ok: true,
            defaultSubjectId: 'sid-1',
            defaultDetailPath: 'dp-1',
            variants: [],
          })
        }

        if (url.includes('/api/embed-tmdb/155')) {
          return Response.json({
            ok: true,
            streams: [
              { url: 'https://cdn.example/movie.m3u8', resolution: 1080 },
              { url: 'https://cdn.example/movie-720.m3u8', resolution: 720 },
            ],
            captions: [{ lang: 'en', name: 'English', url: '/subs/en.vtt' }],
          })
        }

        return new Response('not found', { status: 404 })
      }),
    )

    const [provider] = createOmssProviders({ fetchDubs: false })
    const media: ProviderMediaObject = {
      type: 'movie',
      tmdbId: '155',
      title: 'The Dark Knight',
      releaseYear: '2008',
      imdbId: 'tt0468569',
    }

    const result = await provider.getMovieSources(media)
    expect(result.sources.length).toBe(2)
    expect(result.sources[0].quality).toBe('1080p')
    expect(result.sources[0].provider.id).toBe('netmirror')
    expect(result.sources[0].url).toContain('/v1/proxy?data=')
    expect(result.subtitles.length).toBe(1)
    expect(result.subtitles[0].label).toBe('English')
    expect(result.diagnostics).toEqual([])
  })

  it('returns PROVIDER_ERROR diagnostic when variants fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: false })),
    )

    const [provider] = createOmssProviders()
    const result = await provider.getMovieSources({
      type: 'movie',
      tmdbId: '999',
      title: 'Missing',
      releaseYear: '2020',
      imdbId: '',
    })

    expect(result.sources).toEqual([])
    expect(result.diagnostics[0]?.code).toBe('PROVIDER_ERROR')
  })
})
