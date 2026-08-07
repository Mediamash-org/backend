/** Rank a quality label so higher numbers sort first. Unknowns go last. */
export function qualityRank(quality?: string | null): number {
  if (!quality) return -1
  const s = quality.toLowerCase().trim()

  if (/4k|uhd|ultra/.test(s)) return 2160
  if (/2160/.test(s)) return 2160
  if (/1440|qhd|2k/.test(s)) return 1440
  if (/1080|fhd|full\s*hd/.test(s)) return 1080
  if (/720/.test(s)) return 720
  if (/\bhd\b/.test(s)) return 720
  if (/540/.test(s)) return 540
  if (/480|sd/.test(s)) return 480
  if (/360/.test(s)) return 360
  if (/240/.test(s)) return 240

  const match = s.match(/(\d{3,4})\s*p?\b/)
  if (match) return Number(match[1])

  return 0
}

export function sortSourcesByQuality<T extends { quality?: string | null }>(sources: T[]): T[] {
  return [...sources].sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality))
}
