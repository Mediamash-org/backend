export interface AudioTrackInfo {
  id: string
  label: string
  language?: string
  /** Prefer switching to this source index when selected */
  sourceIndex?: number
  /** HLS.js audio track id */
  hlsTrackId?: number
}

export interface SubtitleTrackInfo {
  id: string
  label: string
  language?: string
  /** External VTT/URL from OMSS sources response */
  url?: string
  /** Fallback URLs if the primary source 403s / fails */
  alternateUrls?: string[]
  format?: string
  /** HTML text track index */
  textTrackIndex?: number
  /** HLS subtitle track id */
  hlsTrackId?: number
}

export function labelForAudio(track: { label?: string; language?: string }, fallback: string): string {
  return track.label || track.language || fallback
}

export function collectSourceAudioOptions(
  sources: Array<{
    audioTracks?: Array<{ label?: string; language?: string }>
    quality?: string
    provider?: { name?: string }
  }>,
): AudioTrackInfo[] {
  const out: AudioTrackInfo[] = []
  const seen = new Set<string>()

  sources.forEach((source, sourceIndex) => {
    const tracks = Array.isArray(source.audioTracks) ? source.audioTracks : []
    if (!tracks.length) {
      const label = source.provider?.name || source.quality || `Source ${sourceIndex + 1}`
      const key = `src:${sourceIndex}:${label}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ id: key, label: `Default · ${label}`, sourceIndex })
      }
      return
    }
    for (const raw of tracks) {
      const label = labelForAudio(raw, `Audio ${sourceIndex + 1}`)
      const key = `${raw.language || ''}:${label}:${sourceIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: key,
        label,
        language: raw.language,
        sourceIndex,
      })
    }
  })

  return out
}
