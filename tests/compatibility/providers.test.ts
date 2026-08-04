import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createOmssHost, type OmssHost } from '../../src/create-host.ts'
import type { ProvidersConfig } from '../../src/plugins/types.ts'

const providersConfig: ProvidersConfig = {
  // Prefer plugin imports under Vitest (framework discoverProviders uses native import of .ts).
  localDirectories: [],
  plugins: [
    {
      package: './src/providers/example.ts',
      enabled: true,
    },
    {
      package: '@omss-server/sample-provider-plugin',
      enabled: true,
      config: { id: 'sample-plugin', name: 'Sample Plugin Provider' },
    },
  ],
  disabled: [],
}

function mockTmdbFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/movie/') && !url.includes('/external_ids')) {
        return new Response(
          JSON.stringify({
            id: 155,
            title: 'The Dark Knight',
            release_date: '2008-07-18',
            status: 'Released',
            adult: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (url.includes('/external_ids')) {
        return new Response(JSON.stringify({ imdb_id: 'tt0468569' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Stream URL probes from SourceService — pretend OK
      return new Response('ok', { status: 200 })
    }),
  )
}

describe('provider plugin compatibility', () => {
  let host: OmssHost

  beforeAll(async () => {
    process.env.INTERNAL_DEBUG = 'true'
    process.env.NODE_ENV = 'test'
    mockTmdbFetch()

    host = await createOmssHost({
      listen: false,
      providersConfig,
      env: {
        ...process.env,
        TMDB_API_KEY: 'test-key',
        CACHE_TYPE: 'memory',
        INTERNAL_DEBUG: 'true',
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: '0',
      },
    })
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    await host.stop()
  })

  it('discovers local + plugin providers', () => {
    const ids = host.manager.list().map((p) => p.id).sort()
    expect(ids).toContain('example')
    expect(ids).toContain('sample-plugin')
  })

  it('exposes providers on OMSS home', async () => {
    const res = await host.app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.spec).toBe('omss')
    expect(body.media).toEqual({ movies: '*', tv: '*' })
    const providerIds = body.providers.map((p: { id: string }) => p.id)
    expect(providerIds).toContain('example')
    expect(providerIds).toContain('sample-plugin')
  })

  it('runs provider pipeline for movie sources', async () => {
    const res = await host.app.inject({ method: 'GET', url: '/v1/movies/155' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id ?? body.responseId).toBeTruthy()
    expect(Array.isArray(body.sources)).toBe(true)
    expect(body.sources.length).toBeGreaterThan(0)
    expect(body.sources[0].provider.id).toMatch(/example|sample-plugin/)
  })

  it('can disable and enable a provider via admin', async () => {
    const disable = await host.app.inject({
      method: 'POST',
      url: '/admin/providers/sample-plugin/disable',
    })
    expect(disable.statusCode).toBe(200)

    const home = await host.app.inject({ method: 'GET', url: '/' })
    const ids = home.json().providers.map((p: { id: string }) => p.id)
    expect(ids).not.toContain('sample-plugin')

    const enable = await host.app.inject({
      method: 'POST',
      url: '/admin/providers/sample-plugin/enable',
    })
    expect(enable.statusCode).toBe(200)

    const home2 = await host.app.inject({ method: 'GET', url: '/' })
    const ids2 = home2.json().providers.map((p: { id: string }) => p.id)
    expect(ids2).toContain('sample-plugin')
  })

  it('lists plugins on admin endpoint', async () => {
    const res = await host.app.inject({ method: 'GET', url: '/admin/providers' })
    expect(res.statusCode).toBe(200)
    const sample = res.json().providers.find((p: { id: string }) => p.id === 'sample-plugin')
    expect(sample.source).toBe('plugin')
  })
})
