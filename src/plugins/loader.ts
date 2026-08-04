import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { BaseProvider, type ProviderRegistry } from '@omss/framework'
import type {
  OmssProviderPluginModule,
  ProviderPluginEntry,
  ProvidersConfig,
  ProviderSource,
} from './types.js'

const DEFAULT_CONFIG_PATH = 'config/providers.json'

export async function loadProvidersConfig(
  configPath = process.env.OMSS_PROVIDERS_CONFIG ?? DEFAULT_CONFIG_PATH,
): Promise<ProvidersConfig> {
  const resolved = path.resolve(configPath)

  try {
    const raw = await readFile(resolved, 'utf8')
    return JSON.parse(raw) as ProvidersConfig
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return {
        localDirectories: [
          process.env.NODE_ENV === 'production' ? './dist/providers' : './src/providers',
        ],
        plugins: parsePluginsFromEnv(),
        disabled: parseDisabledFromEnv(),
      }
    }
    throw error
  }
}

function parsePluginsFromEnv(): ProviderPluginEntry[] {
  const raw = process.env.OMSS_PROVIDER_PLUGINS
  if (!raw?.trim()) return []

  // Comma-separated package names, or JSON array
  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as ProviderPluginEntry[]
  }

  return trimmed
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((pkg) => ({ package: pkg, enabled: true }))
}

function parseDisabledFromEnv(): string[] {
  const raw = process.env.OMSS_PROVIDERS_DISABLED
  if (!raw?.trim()) return []
  return raw.split(',').map((id) => id.trim()).filter(Boolean)
}

function isBaseProviderClass(value: unknown): value is new () => BaseProvider {
  return (
    typeof value === 'function' &&
    Boolean(value.prototype) &&
    BaseProvider.prototype.isPrototypeOf(value.prototype)
  )
}

export async function instantiateFromModule(
  mod: OmssProviderPluginModule,
  entry: ProviderPluginEntry,
): Promise<BaseProvider[]> {
  if (typeof mod.createOmssProviders === 'function') {
    const created = await mod.createOmssProviders(entry.config ?? {})
    return created
  }

  const instances: BaseProvider[] = []

  for (const [name, exported] of Object.entries(mod)) {
    if (name === 'default' && isBaseProviderClass(exported)) {
      instances.push(new exported())
      continue
    }
    if (isBaseProviderClass(exported)) {
      instances.push(new exported())
    }
  }

  if (instances.length === 0 && isBaseProviderClass(mod.default)) {
    instances.push(new mod.default())
  }

  return instances
}

async function importPluginModule(specifier: string): Promise<OmssProviderPluginModule> {
  // Absolute / relative path → resolved import; bare package name → normal import
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    path.isAbsolute(specifier) ||
    /^[a-zA-Z]:[\\/]/.test(specifier)
  ) {
    const resolved = path.resolve(specifier)
    // Vitest/Vite can transform relative path imports; absolute file: URLs often bypass it.
    if (process.env.VITEST) {
      const rel = `./${path.relative(process.cwd(), resolved).replace(/\\/g, '/')}`
      return (await import(rel)) as OmssProviderPluginModule
    }
    return (await import(pathToFileURL(resolved).href)) as OmssProviderPluginModule
  }

  return (await import(specifier)) as OmssProviderPluginModule
}

export interface LoadProvidersResult {
  loaded: Array<{
    id: string
    source: ProviderSource
    packageName?: string
  }>
}

/**
 * Load local BaseProvider modules + installed provider plugins into the registry.
 */
export async function loadProviders(
  registry: ProviderRegistry,
  config?: ProvidersConfig,
): Promise<LoadProvidersResult> {
  const cfg = config ?? (await loadProvidersConfig())
  const loaded: LoadProvidersResult['loaded'] = []

  const localDirs =
    cfg.localDirectories ??
    [process.env.NODE_ENV === 'production' ? './dist/providers' : './src/providers']

  for (const dir of localDirs) {
    const before = new Set(registry.listProviders())
    await registry.discoverProviders(dir)
    for (const id of registry.listProviders()) {
      if (!before.has(id)) {
        loaded.push({ id, source: 'local' })
      }
    }
  }

  for (const entry of cfg.plugins ?? []) {
    try {
      const mod = await importPluginModule(entry.package)
      const instances = await instantiateFromModule(mod, entry)

      if (instances.length === 0) {
        console.warn(
          `[providers] Plugin "${entry.package}" exported no BaseProvider classes or createOmssProviders()`,
        )
        continue
      }

      for (const instance of instances) {
        if (registry.hasProvider(instance.id)) {
          console.warn(
            `[providers] Skipping duplicate provider id "${instance.id}" from ${entry.package}`,
          )
          continue
        }

        if (entry.enabled === false) {
          setProviderEnabled(instance, false)
        }

        registry.register(instance)
        loaded.push({
          id: instance.id,
          source: 'plugin',
          packageName: entry.package,
        })
      }
    } catch (error) {
      console.error(`[providers] Failed to load plugin "${entry.package}":`, error)
    }
  }

  for (const id of cfg.disabled ?? []) {
    const provider = registry.getProvider(id)
    if (provider) setProviderEnabled(provider, false)
  }

  return { loaded }
}

export function setProviderEnabled(provider: BaseProvider, enabled: boolean): void {
  // Class-field `readonly` is compile-time only; runtime enable/disable is supported.
  Object.defineProperty(provider, 'enabled', {
    value: enabled,
    writable: true,
    configurable: true,
    enumerable: true,
  })
}
