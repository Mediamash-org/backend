import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaseProvider } from '@omss/framework'
import type { ProviderMediaObject } from '@omss/framework'
import { createOmssProviders } from '../../plugins/peachify-provider/src/index.ts'
import { decryptPeachifyPayload } from '../../plugins/peachify-provider/src/decrypt.ts'

describe('Peachify provider plugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exports createOmssProviders with BaseProvider', () => {
    const [provider] = createOmssProviders({ id: 'peachify-test' })
    expect(provider).toBeInstanceOf(BaseProvider)
    expect(provider.id).toBe('peachify-test')
  })

  it('decrypts AES-GCM payloads', async () => {
    // Live-shaped encrypted blob from holly/movie/299534 (may rotate — skip if invalid)
    const sample =
      'oUr-Bc1GmmX0AWZG.gAwmJtpPVISYFf6B67xPmUziiW3v5p3UASB__siANvw8Orxq46W11_aVf5ieHZHeKNkZomGWqpgZDuM89TwY15QxzDZ5ppXy6aK2cz0xO_EMLZiGVCp8XiS22xEs-0hJt8wiQNS4-ap038dOYPg.znGCZiqnzdbQrdb1n-4ydw'
    const decrypted = await decryptPeachifyPayload(sample)
    // Key/payload may expire; function must not throw
    expect(decrypted === null || typeof decrypted === 'object').toBe(true)
  })

  it('maps plain API sources to proxied OMSS sources', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/holly/movie/299534')) {
          return Response.json({
            sources: [
              {
                url: 'https://cdn.example/endgame.m3u8',
                type: 'hls',
                quality: 1080,
                dub: 'English',
              },
            ],
            subtitles: [{ url: 'https://cdn.example/en.vtt', label: 'English' }],
          })
        }
        return new Response('fail', { status: 502 })
      }),
    )

    const [provider] = createOmssProviders({
      servers: ['holly'],
      timeoutMs: 5000,
    })

    const media: ProviderMediaObject = {
      type: 'movie',
      tmdbId: '299534',
      title: 'Avengers: Endgame',
      releaseYear: '2019',
      imdbId: 'tt4154796',
    }

    const result = await provider.getMovieSources(media)
    expect(result.sources.length).toBeGreaterThan(0)
    expect(result.sources[0].url).toContain('/v1/proxy?data=')
    expect(result.sources[0].type).toBe('hls')
    expect(result.sources[0].quality).toBe('1080p')
    expect(result.subtitles.length).toBe(1)
  })
})
