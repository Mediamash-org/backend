import type { BaseProvider } from '@omss/framework'

/**
 * Host-side provider plugin configuration.
 * Plugins must export official @omss/framework BaseProvider classes
 * (or a createOmssProviders factory) — not a custom provider interface.
 */
export interface ProviderPluginEntry {
  /** npm package name, or relative/absolute path to a module */
  package: string
  /** When false, load but leave disabled */
  enabled?: boolean
  /** Passed to createOmssProviders(config) when the package exports a factory */
  config?: Record<string, unknown>
}

export interface ProvidersConfig {
  /** Directories scanned with ProviderRegistry.discoverProviders */
  localDirectories?: string[]
  /** Installed provider plugins (npm packages or file: modules) */
  plugins?: ProviderPluginEntry[]
  /** Provider ids forced disabled after load */
  disabled?: string[]
}

export type CreateOmssProviders = (
  config?: Record<string, unknown>,
) => BaseProvider[] | Promise<BaseProvider[]>

export interface OmssProviderPluginModule {
  createOmssProviders?: CreateOmssProviders
  default?: unknown
  [exportName: string]: unknown
}

export type ProviderSource = 'local' | 'plugin'

export interface ManagedProvider {
  id: string
  name: string
  source: ProviderSource
  packageName?: string
  enabled: boolean
  capabilities: Array<'movies' | 'tv' | 'subtitles'>
}
