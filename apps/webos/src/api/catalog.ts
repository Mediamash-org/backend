import type { MediaSummary } from '../api/types'

export const CATALOG_LIMIT = 100
export const CATALOG_RAIL_SIZE = 20

export interface CatalogRail {
  id: string
  title: string
  items: MediaSummary[]
}

/** Dedupe by id and hard-cap the catalog list. */
export function limitCatalog(items: MediaSummary[], limit = CATALOG_LIMIT): MediaSummary[] {
  const seen = new Set<string>()
  const out: MediaSummary[] = []
  for (const item of items) {
    const key = `${item.type}:${item.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

/** Split a flat list into horizontal TV rails. */
export function chunkIntoRails(
  items: MediaSummary[],
  labels: string[],
  size = CATALOG_RAIL_SIZE,
): CatalogRail[] {
  const rails: CatalogRail[] = []
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size)
    if (!slice.length) break
    const index = rails.length
    rails.push({
      id: `rail-${index + 1}`,
      title: labels[index] ?? `More Titles`,
      items: slice,
    })
  }
  return rails
}

export async function fetchCatalogPages(
  fetchPage: (page: number, signal?: AbortSignal) => Promise<{ items: MediaSummary[] }>,
  signal?: AbortSignal,
  limit = CATALOG_LIMIT,
): Promise<MediaSummary[]> {
  const pagesNeeded = Math.ceil(limit / CATALOG_RAIL_SIZE)
  const pages = await Promise.all(
    Array.from({ length: pagesNeeded }, (_, i) => fetchPage(i + 1, signal)),
  )
  return limitCatalog(
    pages.flatMap((p) => p.items),
    limit,
  )
}
