import { BaseProvider } from '@omss/framework'
import { createOmssProviders } from '../plugins/twoembed-provider/src/index.ts'

BaseProvider.setProxyConfig({ host: 'localhost', port: 3000, protocol: 'http' })

const [provider] = createOmssProviders({ timeoutMs: 25_000 })

const result = await provider.getMovieSources({
  type: 'movie',
  tmdbId: '27205',
  title: 'Inception',
  releaseYear: '2010',
  imdbId: 'tt1375666',
})

const summary = {
  sourceCount: result.sources.length,
  subtitleCount: result.subtitles.length,
  diagnostics: result.diagnostics,
  providers: [...new Set(result.sources.map((s) => s.provider.name))],
  qualities: [...new Set(result.sources.map((s) => s.quality))],
  types: [...new Set(result.sources.map((s) => s.type))],
  sample: result.sources.slice(0, 3).map((s) => ({
    type: s.type,
    quality: s.quality,
    provider: s.provider,
    urlPreview: s.url.slice(0, 140) + '...',
  })),
}

console.log(JSON.stringify(summary, null, 2))
if (result.sources.length === 0) process.exit(1)
