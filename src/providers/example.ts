import { BaseProvider } from '@omss/framework'
import type {
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
} from '@omss/framework'

/**
 * Official-style example provider for host smoke tests.
 * Replace with real OMSS BaseProvider modules under this directory.
 *
 * For local demos without reachable stream URLs, set INTERNAL_DEBUG=true
 * so @omss/framework does not filter sources after fetch probes.
 */
export class ExampleProvider extends BaseProvider {
  readonly id = 'example'
  readonly name = 'Example Provider'
  readonly enabled = true
  readonly BASE_URL = 'https://example.com'
  readonly HEADERS = {
    Referer: 'https://example.com',
    'User-Agent': 'Mozilla/5.0',
  }

  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  }

  async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching example movie sources', media)

    return {
      sources: [
        {
          url: this.createProxyUrl(
            `${this.BASE_URL}/movie/${media.tmdbId}.m3u8`,
            this.HEADERS,
          ),
          type: 'hls',
          quality: '1080p',
          audioTracks: [{ language: 'en', label: 'English' }],
          provider: { id: this.id, name: this.name },
        },
      ],
      subtitles: [],
      diagnostics: [],
    }
  }

  async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
    this.console.log('Fetching example TV sources', media)

    return {
      sources: [
        {
          url: this.createProxyUrl(
            `${this.BASE_URL}/tv/${media.tmdbId}/s${media.s}/e${media.e}.m3u8`,
            this.HEADERS,
          ),
          type: 'hls',
          quality: '1080p',
          audioTracks: [{ language: 'en', label: 'English' }],
          provider: { id: this.id, name: this.name },
        },
      ],
      subtitles: [],
      diagnostics: [],
    }
  }
}

/** Optional plugin-style entry (also usable from config/providers.json). */
export function createOmssProviders(): BaseProvider[] {
  return [new ExampleProvider()]
}
