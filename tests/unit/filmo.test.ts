import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaseProvider } from '@omss/framework'
import type { ProviderMediaObject } from '@omss/framework'
import {
  createOmssProviders,
  decryptVoePayload,
  extractPageYear,
  extractProviderChips,
  extractVoeEncodedPayload,
} from '../../plugins/filmo-provider/src/index.ts'

describe('Filmo provider plugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exports createOmssProviders with BaseProvider', () => {
    const [provider] = createOmssProviders({ id: 'filmo-test' })
    expect(provider).toBeInstanceOf(BaseProvider)
    expect(provider.id).toBe('filmo-test')
  })

  it('parses provider chips and page year', () => {
    const html = `
      <span class="ft-meta-label color-medium-grey">2014</span>
      <div role="button" data-provider-chip data-movie-link-id="2723"
           data-p="eyJpdiI6InRlc3QifQ==" aria-label="VOE">VOE</div>
      <div role="button" data-provider-chip data-movie-link-id="2723"
           data-p="eyJpdiI6Im90aGVyIn0=">VOE</div>
    `
    const chips = extractProviderChips(html)
    expect(chips[0]?.linkId).toBe('2723')
    expect(chips[0]?.p).toContain('eyJpdiI6')
    expect(extractPageYear(html)).toBe('2014')
  })

  it('decrypts VOE application/json payload to HLS source', () => {
    // Minimal round-trip using known live-captured ciphertext is brittle;
    // exercise helpers with a freshly encrypted-like pipeline via decrypt of real sample if present,
    // otherwise verify extract + decrypt contract with a synthetic pack.
    const payload = {
      source: 'https://cdn.example/master.m3u8',
      file_code: 'abc123',
      direct_access_url: 'https://cdn.example/file.mp4',
    }
    const encoded = encodeVoePayload(payload)
    const html = `<script type="application/json">${JSON.stringify([encoded])}</script>`
    expect(extractVoeEncodedPayload(html)).toBe(encoded)
    expect(decryptVoePayload(encoded).source).toBe(payload.source)
  })

  it('resolves movie via suggest → mint → VOE HLS proxy', async () => {
    BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })

    const encoded = encodeVoePayload({
      source: 'https://cdn.example/engine/hls/master.m3u8?t=1',
      file_code: 'xcewht60qhjb',
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = (init?.method || 'GET').toUpperCase()

        if (url === 'https://filmo.to/' || url.endsWith('filmo.to/')) {
          return jsonOk({}, { 'set-cookie': 'XSRF-TOKEN=tok%3D; Path=/' })
        }
        if (url.includes('/search/suggest')) {
          return Response.json({
            movies: [{ title: 'Interstellar', url: 'https://filmo.to/movies/interstellar' }],
          })
        }
        if (url.includes('/movies/interstellar') && method === 'GET') {
          return new Response(
            `<meta name="csrf-token" content="csrf123">
             <span class="ft-meta-label color-medium-grey">2014</span>
             <div data-provider-chip data-movie-link-id="2723"
                  data-p="eyJwIjoiMSJ9" aria-label="VOE">VOE</div>`,
            { status: 200 },
          )
        }
        if (url.endsWith('/n') && method === 'POST') {
          return Response.json({ x: 'minttoken' })
        }
        if (url.includes('/n/minttoken')) {
          return new Response(
            `<script>window.location.href = 'https://jessicachoosemake.com/e/abc';</script>`,
            { status: 200 },
          )
        }
        if (url.includes('jessicachoosemake.com/e/abc')) {
          return new Response(
            `<script type="application/json">${JSON.stringify([encoded])}</script>`,
            { status: 200 },
          )
        }
        return new Response('not found', { status: 404 })
      }),
    )

    const [provider] = createOmssProviders({ id: 'filmo' })
    const media = {
      type: 'movie',
      tmdbId: '157336',
      title: 'Interstellar',
      year: 2014,
    } as ProviderMediaObject

    const result = await provider.getMovieSources(media)
    expect(result.sources.length).toBe(1)
    expect(result.sources[0]?.type).toBe('hls')
    expect(result.sources[0]?.url).toContain('/v1/proxy')
    expect(result.sources[0]?.provider?.id).toBe('filmo')
  })

  it('returns diagnostic when suggest has no matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === 'https://filmo.to/' || url.endsWith('filmo.to/')) {
          return new Response('ok', { status: 200 })
        }
        if (url.includes('/search/suggest')) {
          return Response.json({ movies: [] })
        }
        return new Response('no', { status: 404 })
      }),
    )

    const [provider] = createOmssProviders({ id: 'filmo' })
    const result = await provider.getMovieSources({
      type: 'movie',
      tmdbId: '27205',
      title: 'Inception',
    } as ProviderMediaObject)
    expect(result.sources).toEqual([])
    expect(result.diagnostics?.length).toBeGreaterThan(0)
  })
})

function encodeVoePayload(payload: object): string {
  const json = JSON.stringify(payload)
  const b64a = Buffer.from(json, 'utf8').toString('base64')
  const rev = b64a.split('').reverse().join('')
  const shifted = [...rev].map((c) => String.fromCharCode(c.charCodeAt(0) + 3)).join('')
  const b64b = Buffer.from(shifted, 'utf8').toString('base64')
  // insert a pattern token so replacePatterns path is exercised
  const withPatterns = `!!${b64b.slice(0, 4)}@$^^${b64b.slice(4)}`
  return rot13(withPatterns)
}

function rot13(input: string): string {
  return input.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function jsonOk(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  })
}
