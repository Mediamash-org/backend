import type { BaseProvider, ProviderRegistry, ProviderMediaObject, ProviderResult } from '@omss/framework'
import { loadProviders, loadProvidersConfig, setProviderEnabled } from './loader.js'
import {
  addPlayableFilterDiagnostic,
  defaultProbeOrigin,
  filterPlayableSources,
} from '../playability/filter.js'
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
      this.wrapProvider(provider)
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

  private wrapProvider(provider: BaseProvider): void {
    const marker = provider as BaseProvider & { __playabilityWrapped?: boolean }
    if (marker.__playabilityWrapped) return
    marker.__playabilityWrapped = true

    provider.getMovieSources = this.wrapResolver(provider, provider.getMovieSources.bind(provider))
    provider.getTVSources = this.wrapResolver(provider, provider.getTVSources.bind(provider))
  }

  private wrapResolver(
    provider: BaseProvider,
    resolve: (media: ProviderMediaObject) => Promise<ProviderResult>,
  ): (media: ProviderMediaObject) => Promise<ProviderResult> {
    return async (media: ProviderMediaObject): Promise<ProviderResult> => {
      const result = await resolve(media)
      const sources = Array.isArray(result?.sources) ? result.sources : []
      if (!sources.length) return result

      const filtered = await filterPlayableSources(
        sources,
        defaultProbeOrigin(),
        Number(process.env.SOURCE_PROBE_TIMEOUT_MS ?? 12_000),
        Number(process.env.SOURCE_PROBE_CACHE_TTL_MS ?? 180_000),
      )

      return {
        ...result,
        sources: filtered.sources as ProviderResult['sources'],
        diagnostics: addPlayableFilterDiagnostic(
          Array.isArray(result?.diagnostics) ? result.diagnostics : [],
          filtered.removed,
          'PROVIDER_UNPLAYABLE_SOURCE_FILTERED',
          `${provider.name}: filtered`,
        ) as ProviderResult['diagnostics'],
      }
    }
  }
}
