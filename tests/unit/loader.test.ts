import { describe, expect, it } from 'vitest'
import { ProviderRegistry } from '@omss/framework'
import { instantiateFromModule, loadProviders } from '../../src/plugins/loader'

describe('provider plugin loader', () => {
  it('instantiates createOmssProviders factory modules', async () => {
    const mod = await import('../../plugins/sample-provider-plugin/src/index.ts')
    const instances = await instantiateFromModule(mod, {
      package: 'sample',
      config: { id: 'from-factory' },
    })
    expect(instances).toHaveLength(1)
    expect(instances[0].id).toBe('from-factory')
  })

  it('loads provider plugins into the registry', async () => {
    const registry = new ProviderRegistry({
      host: 'localhost',
      port: 3000,
      protocol: 'http',
    })

    const result = await loadProviders(registry, {
      localDirectories: [],
      plugins: [
        { package: './src/providers/example.ts', enabled: true },
        {
          package: '@omss-server/sample-provider-plugin',
          enabled: true,
          config: { id: 'sample-plugin' },
        },
      ],
    })

    expect(result.loaded.some((l) => l.id === 'example' && l.source === 'plugin')).toBe(true)
    expect(result.loaded.some((l) => l.id === 'sample-plugin' && l.source === 'plugin')).toBe(
      true,
    )
    expect(registry.hasProvider('example')).toBe(true)
    expect(registry.hasProvider('sample-plugin')).toBe(true)
  })
})
