import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaseProvider } from '@omss/framework'
import type { ProviderMediaObject } from '@omss/framework'
import {
  createOmssProviders,
  extractVixEmbedUrl,
  parseVixMasterPlaylist,
  withAuthParams,
} from '../../plugins/streamingunity-provider/src/index.ts'

describe('StreamingUnity provider plugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exports createOmssProviders with BaseProvider', () => {
    const [provider] = createOmssProviders({ id: 'su-test' })
    expect(provider).toBeInstanceOf(BaseProvider)
    expect(provider.id).toBe('su-test')
  })

  it('parses VixCloud masterPlaylist helpers', () => {
    const html = `
      <script>
        window.streams = [{"name":"Server2","active":1,"url":"https:\\/\\/vixcloud.co\\/playlist\\/231752?b=1\\u0026ab=1"}];
        window.masterPlaylist = {
            params: {
                'token': 'abc123token',
                'expires': '1791148433',
            },
            url: 'https://vixcloud.co/playlist/231752?b=1',
        }
      </script>
      <iframe src="https://vixcloud.co/embed/231752?token=x&amp;expires=1"></iframe>
    `
    const master = parseVixMasterPlaylist(html)
    expect(master?.token).toBe('abc123token')
    expect(master?.expires).toBe('1791148433')
    expect(master?.url).toContain('/playlist/231752')
    expect(master?.streams[0]?.name).toBe('Server2')
    expect(extractVixEmbedUrl(html)).toContain('vixcloud.co/embed/231752')
    expect(withAuthParams(master!.url, master!.token, master!.expires)).toContain('token=abc123token')
  })

  it('resolves movie via search → title → iframe → proxied HLS', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/en/search?q=Inception')) {
          return Response.json({
            data: [{ id: 733, slug: 'inception', name: 'Inception', type: 'movie' }],
          })
        }
        if (url.includes('/en/titles/733-inception')) {
          return new Response(
            `<div id="app" data-page="{&quot;component&quot;:&quot;Titles/Title&quot;,&quot;props&quot;:{&quot;title&quot;:{&quot;id&quot;:733,&quot;slug&quot;:&quot;inception&quot;,&quot;name&quot;:&quot;Inception&quot;,&quot;type&quot;:&quot;movie&quot;,&quot;tmdb_id&quot;:27205,&quot;scws_id&quot;:231752}}}"></div>`,
            { status: 200 },
          )
        }
        if (url.includes('/en/iframe/733')) {
          return new Response(
            `<iframe src="https://vixcloud.co/embed/231752?token=embedtoken&amp;expires=1"></iframe>`,
            { status: 200 },
          )
        }
        if (url.includes('vixcloud.co/embed/231752')) {
          return new Response(
            `<script>
              window.streams = [{"name":"Server1","url":"https:\\/\\/vixcloud.co\\/playlist\\/231752?b=1"}];
              window.masterPlaylist = {
                params: { 'token': 'playtoken', 'expires': '1791148433' },
                url: 'https://vixcloud.co/playlist/231752?b=1',
              }
            </script>`,
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
    }

    const result = await provider.getMovieSources(media)
    expect(result.sources.length).toBeGreaterThanOrEqual(1)
    expect(result.sources[0].type).toBe('hls')
    expect(result.sources[0].url).toContain('/v1/proxy?data=')

    const payload = JSON.parse(
      decodeURIComponent(result.sources[0].url.split('data=')[1]!),
    ) as { url: string; headers: Record<string, string> }
    expect(payload.url).toContain('vixcloud.co/playlist/231752')
    expect(payload.url).toContain('token=playtoken')
    expect(payload.headers.Referer).toBe('https://vixcloud.co/')
  })

  it('returns diagnostic when search has no TMDB match', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/en/search?')) {
          return Response.json({
            data: [{ id: 1, slug: 'other', name: 'Other', type: 'movie' }],
          })
        }
        if (url.includes('/en/titles/1-other')) {
          return new Response(
            `<div data-page="{&quot;props&quot;:{&quot;title&quot;:{&quot;id&quot;:1,&quot;slug&quot;:&quot;other&quot;,&quot;name&quot;:&quot;Other&quot;,&quot;type&quot;:&quot;movie&quot;,&quot;tmdb_id&quot;:999}}}"></div>`,
            { status: 200 },
          )
        }
        return new Response('fail', { status: 502 })
      }),
    )

    const [provider] = createOmssProviders({ timeoutMs: 5000, maxSearchCandidates: 3 })
    const result = await provider.getMovieSources({
      type: 'movie',
      tmdbId: '27205',
      title: 'Inception',
    })
    expect(result.sources).toEqual([])
    expect(result.diagnostics?.[0]?.message).toMatch(/No title matched TMDB/)
  })
})
