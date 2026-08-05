import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaseProvider } from '@omss/framework'
import type { ProviderMediaObject } from '@omss/framework'
import {
  createOmssProviders,
  generatePikashowSignature,
  normalizePikashowTitle,
  scoreTitleMatch,
} from '../../plugins/pikashow-provider/src/index.ts'

describe('Pikashow provider plugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exports createOmssProviders with BaseProvider', () => {
    const [provider] = createOmssProviders({ id: 'pika-test' })
    expect(provider).toBeInstanceOf(BaseProvider)
    expect(provider.id).toBe('pika-test')
  })

  it('normalizes titles and scores matches', () => {
    expect(normalizePikashowTitle('Inception - Hybrid (Dual)')).toContain('inception')
    expect(scoreTitleMatch('Inception - Hybrid (Dual)', 'Inception')).toBeLessThan(3)
    expect(scoreTitleMatch('Interstellar IMAX (Dual)', 'Inception')).toBe(99)
  })

  it('generates stable HMAC signatures', () => {
    const sig = generatePikashowSignature('picashow-api-secret-key', 'picashow-api-secret-2025', 1700000000)
    expect(sig).toMatch(/^[a-f0-9]{64}$/)
    expect(
      generatePikashowSignature('picashow-api-secret-key', 'picashow-api-secret-2025', 1700000000),
    ).toBe(sig)
  })

  it('resolves movie via catalog + signed video API', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/v1/api/videos?type=hollywood')) {
          return Response.json({
            records: [
              {
                so: 21160,
                t: 'Inception - Hybrid (Dual)',
                y: 2010,
                q: 'HD',
              },
            ],
          })
        }
        if (url.includes('/v1/api/videos?type=bollywood')) {
          return Response.json({ records: [] })
        }
        if (url.includes('/v1/api/video?')) {
          return Response.json({
            code: 200,
            data: {
              t: 'Inception - Hybrid (Dual)',
              playUrl: 'https://cdn.example/master.m3u8',
              languageOptions: [
                {
                  language: 'English',
                  playUrl: 'https://cdn.example/en/master.m3u8',
                },
                {
                  language: 'Hindi',
                  playUrl: 'https://cdn.example/hi/master.m3u8',
                },
              ],
              headers: {
                Referer: 'https://loffe414wil.com/',
                Origin: 'https://loffe414wil.com',
              },
            },
          })
        }
        return new Response('no', { status: 404 })
      }),
    )

    const [provider] = createOmssProviders({ id: 'pikashow', maxLangSources: 2 })
    const result = await provider.getMovieSources({
      type: 'movie',
      tmdbId: '27205',
      title: 'Inception',
      year: 2010,
    } as ProviderMediaObject)

    expect(result.sources.length).toBe(2)
    expect(result.sources[0]?.type).toBe('hls')
    expect(result.sources[0]?.url).toContain('/v1/proxy')
    expect(result.sources[0]?.provider?.id).toBe('pikashow')
  })

  it('resolves TV episode from nested detail', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/v1/api/videos?type=series')) {
          return Response.json({
            series: [{ t: 'Breaking Bad (Dual)', y: 2012, n: 5 }],
          })
        }
        if (url.includes('/v1/api/video?')) {
          return Response.json({
            code: 200,
            data: {
              t: 'Breaking Bad (Dual)',
              detail: [
                {
                  season: '1',
                  episodes: [
                    {
                      e: '1',
                      host: 'cdn.example',
                      resolutions: [
                        {
                          label: '1080p',
                          url: 'https://cdn.example/bb/s1e1/1080p.m3u8',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          })
        }
        return new Response('no', { status: 404 })
      }),
    )

    const [provider] = createOmssProviders({ id: 'pikashow' })
    const result = await provider.getTVSources({
      type: 'tv',
      tmdbId: '1396',
      title: 'Breaking Bad',
      s: 1,
      e: 1,
    } as ProviderMediaObject)

    expect(result.sources.length).toBe(1)
    expect(result.sources[0]?.quality).toBe('1080p')
  })
})
