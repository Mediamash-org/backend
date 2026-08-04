import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
} from '@omss/framework'

export interface SamplePluginConfig {
  id?: string
  name?: string
  baseUrl?: string
}

/**
 * Sample provider packaged as an installable plugin.
 * Hosts load this via createOmssProviders() — still a normal BaseProvider.
 */
export class SamplePluginProvider extends BaseProvider {
  readonly id: string
  readonly name: string
  readonly enabled = true
  readonly BASE_URL: string
  readonly HEADERS = {
    Referer: 'https://sample-plugin.example',
    'User-Agent': 'omss-sample-provider-plugin',
  }

  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  constructor(config: SamplePluginConfig = {}) {
    super()
    this.id = config.id ?? 'sample-plugin'
    this.name = config.name ?? 'Sample Plugin Provider'
    this.BASE_URL = config.baseUrl ?? 'https://sample-plugin.example'
  }

  async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
    return {
      sources: [
        {
          url: this.createProxyUrl(
            `${this.BASE_URL}/movie/${media.tmdbId}.m3u8`,
            this.HEADERS,
          ),
          type: 'hls',
          quality: '720p',
          audioTracks: [{ language: 'en', label: 'English' }],
          provider: { id: this.id, name: this.name },
        },
      ],
      subtitles: [],
      diagnostics: [],
    }
  }

  async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
    return {
      sources: [
        {
          url: this.createProxyUrl(
            `${this.BASE_URL}/tv/${media.tmdbId}/s${media.s}/e${media.e}.m3u8`,
            this.HEADERS,
          ),
          type: 'hls',
          quality: '720p',
          audioTracks: [{ language: 'en', label: 'English' }],
          provider: { id: this.id, name: this.name },
        },
      ],
      subtitles: [],
      diagnostics: [],
    }
  }
}

/** Preferred plugin entrypoint for hosts that pass per-plugin config. */
export function createOmssProviders(config: SamplePluginConfig = {}): BaseProvider[] {
  return [new SamplePluginProvider(config)]
}
