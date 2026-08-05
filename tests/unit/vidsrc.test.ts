import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaseProvider } from '@omss/framework'
import type { ProviderMediaObject } from '@omss/framework'
import { createOmssProviders } from '../../plugins/vidsrc-provider/src/index.ts'

describe('VidSrc provider plugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exports createOmssProviders with BaseProvider', () => {
    const [provider] = createOmssProviders({ id: 'vidsrc-test' })
    expect(provider).toBeInstanceOf(BaseProvider)
    expect(provider.id).toBe('vidsrc-test')
  })

  it('maps embed → rcp → prorcp file: templates to proxied HLS', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/embed/movie')) {
          return new Response(
            `<html><iframe src="//cloudnestra.com/rcp/abcHASH"></iframe></html>`,
            { status: 200 },
          )
        }
        if (url.includes('/rcp/')) {
          return new Response(
            `<html><script>src: '/prorcp/xyzTOKEN',</script></html>`,
            { status: 200 },
          )
        }
        if (url.includes('/prorcp/')) {
          return new Response(
            `<html><script>jwplayer().setup({ file: "https://{v4}/playlist/x.m3u8 or https://{v1}/playlist/y.m3u8" })</script></html>`,
            { status: 200 },
          )
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
    expect(result.sources.length).toBe(2)
    expect(result.sources.every((s) => s.type === 'hls')).toBe(true)
    expect(result.sources[0].url).toContain('/v1/proxy?data=')
    expect(result.sources[0].quality).toBe('Auto')
  })

  it('reports Turnstile challenge as diagnostic', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/embed/movie')) {
          return new Response(`<iframe src="//cloudnestra.com/rcp/h"></iframe>`, {
            status: 200,
          })
        }
        if (url.includes('/rcp/')) {
          return new Response(`src: '/prorcp/t'`, { status: 200 })
        }
        return new Response(
          `<div class="cf-turnstile"></div><script>$.post("/rcp_verify")</script>`,
          { status: 200 },
        )
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
    expect(result.diagnostics?.[0]?.message).toMatch(/Turnstile/i)
  })
})
