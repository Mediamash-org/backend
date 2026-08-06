import { createOmssProviders } from '@omss-server/vidcore-provider'

const [provider] = createOmssProviders({ maxStreams: 4 })

async function run(label, media) {
  const started = Date.now()
  const result =
    media.type === 'tv'
      ? await provider.getTVSources(media)
      : await provider.getMovieSources(media)
  const ms = Date.now() - started
  console.log(`\n=== ${label} (${ms}ms) ===`)
  console.log(
    'sources',
    result.sources.length,
    result.sources.map((s) => ({
      name: s.provider?.name,
      quality: s.quality,
      url: String(s.url).slice(0, 90),
    })),
  )
  console.log(
    'subs',
    result.subtitles.length,
    result.subtitles.slice(0, 3).map((s) => s.label),
  )
  if (result.diagnostics?.length) console.log('diag', result.diagnostics)
}

await run('movie Inception', {
  type: 'movie',
  tmdbId: '27205',
  title: 'Inception',
  year: 2010,
})
await run('tv GoT S1E1', {
  type: 'tv',
  tmdbId: '1399',
  s: 1,
  e: 1,
  title: 'Game of Thrones',
})
