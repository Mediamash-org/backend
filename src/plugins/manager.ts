import type { BaseProvider, ProviderRegistry } from '@omss/framework'
import { loadProviders, loadProvidersConfig, setProviderEnabled } from './loader.js'
import type { ManagedProvider, ProvidersConfig, ProviderSource } from './types.js'

interface TrackedProvider {
  instance: BaseProvider
  source: ProviderSource
  packageName?: string
}

/**
 * Tracks loaded providers for admin list / enable / disable / reload.
 * Execution still goes through the official ProviderRegistry.
 */
export class ProviderPluginManager {
  private tracked = new Map<string, TrackedProvider>()

  constructor(private registry: ProviderRegistry) {}

  async load(config?: ProvidersConfig): Promise<void> {
    const cfg = config ?? (await loadProvidersConfig())
    const { loaded } = await loadProviders(this.registry, cfg)

    const packageById = new Map(
      loaded.filter((l) => l.packageName).map((l) => [l.id, l.packageName!]),
    )
    const sourceById = new Map(loaded.map((l) => [l.id, l.source]))

    for (const provider of this.registry.getProviders()) {
      this.tracked.set(provider.id, {
        instance: provider,
        source: sourceById.get(provider.id) ?? 'local',
        packageName: packageById.get(provider.id),
      })
    }
  }

  list(): ManagedProvider[] {
    return [...this.tracked.values()].map(({ instance, source, packageName }) => ({
      id: instance.id,
      name: instance.name,
      source,
      packageName,
      enabled: instance.enabled,
      capabilities: instance.capabilities.supportedContentTypes.map((c) =>
        c === 'sub' ? 'subtitles' : c,
      ),
    }))
  }

  get(id: string): BaseProvider | undefined {
    return this.tracked.get(id)?.instance ?? this.registry.getProvider(id)
  }

  enable(id: string): boolean {
    const tracked = this.tracked.get(id)
    const provider = tracked?.instance ?? this.registry.getProvider(id)
    if (!provider) return false

    setProviderEnabled(provider, true)
    if (!this.registry.hasProvider(id)) {
      this.registry.register(provider)
    }
    return true
  }

  disable(id: string): boolean {
    const tracked = this.tracked.get(id)
    const provider = tracked?.instance ?? this.registry.getProvider(id)
    if (!provider) return false

    setProviderEnabled(provider, false)
    return true
  }

  async health(): Promise<Record<string, boolean>> {
    const results = await this.registry.healthCheckAll()
    return Object.fromEntries(results.entries())
  }

  async reload(config?: ProvidersConfig): Promise<void> {
    this.registry.clear()
    this.tracked.clear()
    await this.load(config)
  }
}
